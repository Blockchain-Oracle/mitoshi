/**
 * exit-keeper (S24.3, D-193): runs the owners' Trail, take-profit and stop-loss with the app closed. Each trigger is
 * the owner's own (signed by their Trading Balance session key, stored by `/api/exits`); the keeper decides *when* —
 * a trail on every display tick (D-196), a take-profit or stop-loss on what Close pays on the book (D-197) — and sells
 * through the owner's EXIT grant with `exitFor`: an IOC at the vault's fair-value floor at a fresh signed RedStone spot,
 * rounded up onto the tick grid, so the contract decides the lowest price. It pays its own gas (`sendOps`, `keeper`
 * role), publishes the sale on the owner's `user:` topic and is restart safe: a row is claimed before the send, the hash
 * is stored once signed, and a leftover claim is settled from its receipt. Non-critical: an idle or failing keeper
 * shows on `/health` without failing it. No `keeper` key, no DATABASE_URL or `DRY_RUN` → watch and report only.
 */
import type { Address, Hex } from "viem";
import { tickerById, type TickerSymbol } from "@cwf/core";
import type { ExitFiredEvent, ExitReason, ExitTrailEvent } from "@cwf/core/exits";
import { createPgExitTriggersStore, type ExitTriggerRow } from "@cwf/db";
import { exitFromBook } from "@cwf/markets";
import {
  createOpsClient, engineErrorName, exitBooked, exitForCall, exitLimitOwnTicks, exitVenueOf, guardFeedOf, lotsAtOrAbove, OPS_VALID_FOR_SEC, OpsSendError,
  readExitFloorRaw, readExitGrants, readExitTargets, sendOps, venueOf, type ExitVenue,
} from "@cwf/markets/ops";
import { errorText, roleKey, runActor, type VenueDeps } from "../../runtime";
import { fetchRedstoneLatest } from "../../prices/redstone-gateway";
import { spotProofOf } from "../../prices/spot-proof";
import { judge, retryDelayMs, trailStep } from "./decide";

const DEFAULT_REFRESH_MS = 2_000;
const NS = 1_000_000_000n;
/** A display tick older than this doesn't move a trail in a pass (the listener sees every fresh one). */
const FRESH_TICK_MS = 15_000;
/** "Not now" refusals: the trigger stays armed and is tried again. */
const BENIGN = new Set(["ImmediateOrCancelNoFill", "BelowFairFloor", "Insufficient", "OpenPrintMissing", "SigmaNotSet", "NoSpotSource"]);

interface TrailState {
  nonce: bigint;
  stopE8: bigint;
  persistedE8: bigint;
  hit: boolean;
  symbol: TickerSymbol | null;
}

export function exitKeeperRefreshMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.EK_REFRESH_MS);
  return Number.isFinite(n) && n >= 1_000 ? n : DEFAULT_REFRESH_MS;
}

const sameAddr = (a: string | null, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

export function startExitKeeper(deps: VenueDeps): { stop: () => void } {
  const key = roleKey("keeper", deps.env.network, process.env, deps.env.keysDir);
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl, privateKey: key, tier: 1 });
  const venue = venueOf(client.chainId);
  const store = deps.sql ? createPgExitTriggersStore(deps.sql) : null;
  const dryRun = deps.env.dryRun || !key;
  if (!key) deps.log("KEEPER_PRIVATE_KEY / keeper.json missing: watching and reporting only");
  const keeper = (client.address ?? "0x0000000000000000000000000000000000000000") as Address;

  let ev: ExitVenue | null | undefined;
  let armed: ExitTriggerRow[] = [];
  const trails = new Map<number, TrailState>();
  const feeds = new Map<number, string | null>();
  const inFlight = new Set<number>();
  const retryAt = new Map<number, number>();
  const counts = { fired: 0, failed: 0, refused: 0 };
  let recent: Array<{ id: number; owner: string; reason: ExitReason; tx: string; proceedsBase: string }> = [];
  let lastSay: string[] = [];

  const feedOf = async (ticker: number): Promise<string | null> => {
    if (!feeds.has(ticker)) feeds.set(ticker, await guardFeedOf(client, ev!.guard, ticker));
    return feeds.get(ticker) ?? null;
  };

  const publish = (owner: string, event: "exit" | "exit-trail", data: ExitFiredEvent | ExitTrailEvent) => deps.bus.publish(`user:${owner.toLowerCase()}`, event, data);

  /** Sells one position for `reason`. Every outcome lands in the store: fired, released with why, or closed. */
  const fire = async (row: ExitTriggerRow, reason: ExitReason): Promise<string> => {
    if (!store || !ev || inFlight.has(row.id) || (retryAt.get(row.id) ?? 0) > Date.now()) return "";
    if (dryRun) return `DRY #${row.id} ${reason}`;
    inFlight.add(row.id);
    const release = async (why: string) => {
      await store.release(row.id, why, Date.now());
      retryAt.set(row.id, Date.now() + retryDelayMs(row.attempts + 1));
      const t = trails.get(row.id);
      if (t) t.hit = false;
      return `#${row.id} ${reason} not sold: ${why}`;
    };
    try {
      if (!(await store.claim(row.id, row.nonce, reason, Date.now()))) return "";
      const owner = row.owner as Address;
      const market = row.market as Hex;
      const nowSec = Math.floor(Date.now() / 1000);
      const grant = (await readExitGrants(client, ev, [owner], keeper, nowSec)).get(owner.toLowerCase());
      if (!grant) return await release("no EXIT grant yet");
      if (grant.why) return await release(grant.why);
      if (grant.market && !sameAddr(grant.market, market)) return await release("the EXIT grant covers another Window");
      const [read] = await readExitTargets(client, ev, [{ owner, marketId: market, side: row.side }], () => true);
      const w = read!.window;
      if (!w || !w.trading || nowSec >= w.lockAtSec) {
        await store.close(row.id, "expired", "the Window locked", Date.now());
        return `#${row.id}: the Window locked`;
      }
      const lots = read!.heldRaw / w.grid.lotBase;
      if (lots === 0n) {
        await store.close(row.id, "gone", "nothing left to sell", Date.now());
        return `#${row.id}: nothing left to sell`;
      }
      const feed = await feedOf(w.ticker);
      if (!feed) return await release(`no spot source for ticker ${w.ticker}`);
      const proof = spotProofOf((await fetchRedstoneLatest(deps.redstone.gateways)).text, feed, deps.redstone.signers, deps.redstone.threshold);
      if (!proof) return await release(`no RedStone ${feed} spot with ${deps.redstone.threshold} signers`);
      let floorRaw: bigint;
      try {
        floorRaw = await readExitFloorRaw(client, ev, grant.grantId, market, row.side, proof.payload);
      } catch (error) {
        return await release(`no floor: ${engineErrorName(error) ?? errorText(error).slice(0, 120)}`);
      }
      const own = exitLimitOwnTicks(floorRaw, w.grid.tickBase);
      if (own === null) return await release("the floor is the whole payout");
      if (!read!.book || lotsAtOrAbove(read!.book, row.side, own) === 0n) return await release(`no bid at or above the floor (${(own / 10).toFixed(1)}¢)`);
      const expireNs = BigInt(Math.min(nowSec + 60, w.lockAtSec)) * NS;
      const call = exitForCall(ev.vault, { grantId: grant.grantId, marketId: market, side: row.side, ownTicks: own, tickBase: w.grid.tickBase, quantityRaw: lots * w.grid.lotBase, expireNs, proof: proof.payload });
      const sent = await sendOps(client, [call], { onSigned: (hash) => void store.setFireTx(row.id, hash, Date.now()).catch(() => undefined) });
      const booked = exitBooked(sent.receipt.logs, ev.vault, owner, market, grant.grantId);
      if (!booked) return await release("nothing sold at the floor");
      await finish(row, reason, sent.hash, booked, w.ticker);
      return `#${row.id} ${reason} sold ${booked.contractsRaw} for ${booked.proceedsBase} ${sent.hash.slice(0, 10)}`;
    } catch (error) {
      const name = (error instanceof OpsSendError ? error.errorName : null) ?? engineErrorName(error);
      if (name === "MarketNotTrading") {
        await store.close(row.id, "expired", "the Window locked", Date.now());
        return `#${row.id}: the Window locked`;
      }
      if (!name || !BENIGN.has(name)) counts.failed += 1;
      else counts.refused += 1;
      return await release(name ?? errorText(error).slice(0, 160));
    } finally {
      inFlight.delete(row.id);
    }
  };

  const finish = async (row: ExitTriggerRow, reason: ExitReason, txHash: string, booked: { proceedsBase: bigint; contractsRaw: bigint }, ticker: number | null) => {
    await store!.markFired(row.id, { txHash, ...booked }, Date.now());
    counts.fired += 1;
    recent = [{ id: row.id, owner: row.owner, reason, tx: txHash, proceedsBase: booked.proceedsBase.toString() }, ...recent].slice(0, 20);
    const symbol = (ticker !== null ? tickerById(ticker)?.symbol : null) ?? trails.get(row.id)?.symbol ?? "";
    trails.delete(row.id);
    publish(row.owner, "exit", { vault: row.vault as Address, marketId: row.market as Hex, side: row.side, symbol, reason, proceedsBase: booked.proceedsBase.toString(), contractsRaw: booked.contractsRaw.toString(), txHash });
  };

  /** Claims this process doesn't hold: settled from the receipt, or released once the send can no longer land. */
  const recover = async (): Promise<string[]> => {
    const notes: string[] = [];
    for (const row of await store!.firing()) {
      if (inFlight.has(row.id)) continue;
      const age = Date.now() - (row.firingSinceMs ?? 0);
      if (!row.fireTx) {
        await store!.release(row.id, "restarted before the sale was sent", Date.now());
        notes.push(`#${row.id} released (never sent)`);
        continue;
      }
      const receipt = await client.public.getTransactionReceipt({ hash: row.fireTx as Hex }).catch(() => null);
      if (receipt?.status === "success") {
        const booked = exitBooked(receipt.logs, ev!.vault, row.owner as Address, row.market as Hex, null);
        if (booked) {
          await finish(row, row.reason ?? "trail", row.fireTx, booked, null);
          notes.push(`#${row.id} recovered as sold`);
        } else {
          await store!.release(row.id, "nothing sold at the floor", Date.now());
          notes.push(`#${row.id} recovered: nothing sold`);
        }
      } else if (receipt || age > (OPS_VALID_FOR_SEC + 30) * 1000) {
        await store!.release(row.id, receipt ? "the sale reverted" : "the sale never landed", Date.now());
        notes.push(`#${row.id} released (${receipt ? "reverted" : "expired"})`);
      }
    }
    return notes;
  };

  // Every display tick moves the trails on its symbol; a hit sells at once.
  const unsubscribe = deps.display?.subscribe((q) => {
    for (const row of armed) {
      const t = trails.get(row.id);
      if (!t || t.hit || t.symbol !== q.symbol) continue;
      const step = trailStep(row, t.stopE8, q.priceE8);
      if (step.kind === "move") t.stopE8 = step.stopE8;
      else if (step.kind === "hit") {
        t.hit = true;
        void fire(row, "trail").then((note) => note && deps.log(note), (error: unknown) => deps.log(`#${row.id} trail: ${errorText(error).slice(0, 160)}`));
      }
    }
  });

  const pass = async () => {
    if (!store) return { why: "no DATABASE_URL: idle" };
    if (!venue) return { why: "the engine is not deployed on this network; idle" };
    if (ev === undefined) ev = await exitVenueOf(client, venue);
    if (!ev) return { why: "EventVaultV2 is not deployed on this network; idle" };
    const notes = await recover();
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    armed = await store.armed(nowSec);
    const live = new Set(armed.map((r) => r.id));
    for (const id of trails.keys()) if (!live.has(id)) trails.delete(id);
    for (const row of armed) {
      if (row.trailBps === null || row.trailStopE8 === null) continue;
      const t = trails.get(row.id);
      if (!t || t.nonce !== row.nonce) trails.set(row.id, { nonce: row.nonce, stopE8: row.trailStopE8, persistedE8: row.trailStopE8, hit: false, symbol: t?.symbol ?? null });
    }
    if (armed.length === 0) return { why: `no armed exits · ${summary()}${notes.length ? ` | ${notes.join(" | ")}` : ""}`, detail: detail() };

    const targets = armed.map((r) => ({ owner: r.owner as Address, marketId: r.market as Hex, side: r.side }));
    const reads = await readExitTargets(client, ev, targets, (_, i) => armed[i]!.takeProfitBase !== null || armed[i]!.stopLossBase !== null);
    const grants = await readExitGrants(client, ev, targets.map((t) => t.owner), keeper, nowSec);
    const fires: Promise<string>[] = [];
    armed.forEach((row, i) => {
      const read = reads[i]!;
      const w = read.window;
      const t = trails.get(row.id);
      if (t && w) {
        t.symbol ??= tickerById(w.ticker)?.symbol ?? null;
        // The pass also steps the newest tick, so a trail moves even if the listener missed one.
        const q = t.symbol ? deps.display?.latest(t.symbol) : null;
        if (q && !t.hit && nowMs - q.atMs < FRESH_TICK_MS) {
          const step = trailStep(row, t.stopE8, q.priceE8);
          if (step.kind === "move") t.stopE8 = step.stopE8;
          else if (step.kind === "hit") t.hit = true;
        }
      }
      const valueBase = read.book && w ? (exitFromBook(read.book, w.grid, row.side, read.heldRaw / w.grid.lotBase, nowMs)?.proceedsBase ?? null) : null;
      const verdict = judge(row, { heldRaw: read.heldRaw, window: w ? { trading: w.trading, lockAtSec: w.lockAtSec, lotBase: w.grid.lotBase } : null, valueBase }, nowSec, t?.hit ?? false);
      if (verdict.kind === "close") fires.push(store.close(row.id, verdict.status, verdict.why, nowMs).then(() => `#${row.id}: ${verdict.why}`));
      else if (verdict.kind === "wait") notes.push(`#${row.id}: ${verdict.why}`);
      else {
        const g = grants.get(row.owner.toLowerCase());
        const blocked = !g ? "no EXIT grant yet" : g.why ?? (g.market && !sameAddr(g.market, row.market) ? "the EXIT grant covers another Window" : null);
        if (blocked) fires.push(store.note(row.id, row.nonce, blocked, nowMs).then(() => ""));
        else if (verdict.kind === "fire") fires.push(fire(row, verdict.reason));
        else if (row.lastError) fires.push(store.note(row.id, row.nonce, null, nowMs).then(() => ""));
      }
    });
    notes.push(...(await Promise.all(fires)).filter(Boolean));

    // The trail stops that moved: stored (unless the owner replaced the trigger) and shown to the owner's terminal.
    for (const row of armed) {
      const t = trails.get(row.id);
      if (!t || t.stopE8 === t.persistedE8 || dryRun) continue;
      if (await store.moveTrail(row.id, row.nonce, t.stopE8, Date.now())) {
        t.persistedE8 = t.stopE8;
        publish(row.owner, "exit-trail", { vault: row.vault as Address, marketId: row.market as Hex, side: row.side, trailStopE8: t.stopE8.toString() });
      }
    }
    lastSay = notes.slice(0, 6);
    return { why: `${armed.length} armed · ${trails.size} trailing · ${summary()}${lastSay.length ? ` | ${lastSay.join(" | ")}` : ""}${dryRun ? " · DRY RUN" : ""}`, detail: detail() };
  };

  const summary = () => `fired ${counts.fired}${counts.refused ? `, refused ${counts.refused}` : ""}${counts.failed ? `, failed ${counts.failed}` : ""}`;
  const detail = () => ({ keeper, vault: ev?.vault ?? null, armed: armed.length, trailing: trails.size, counts: { ...counts }, recent });

  const actor = runActor({ name: "exit-keeper", log: deps.log, dryRun, everyMs: exitKeeperRefreshMs(), pass, critical: false });
  return {
    stop: () => {
      unsubscribe?.();
      actor.stop();
    },
  };
}
