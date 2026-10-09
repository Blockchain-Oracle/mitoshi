// Ported in role from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/settler/{index,execute,views}.ts
/**
 * settler (plan C.5.2): settles or voids every Window once its prints allow, sweeps its resting orders, and after the
 * 300 s claim grace pays every remaining holder with `redeemFor` — skipping holders who opted out of third-party
 * cranks (T09, `lens.crankOptedOut`; the products that manage their own redemption). The worklist comes from the index
 * (Windows past expiry or a deadline, terminal Windows with unredeemed holders or open orders); every send re-reads
 * the Window and each holder's position on chain first. One writer: the `settler` key. The EventVault's owners are
 * paid by its `crankSettle` worklist (`vault-crank.ts`, S7) inside the same send budget, after the engine's work.
 */
import type { Address, Hex } from "viem";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { chainNowSec, createOpsClient, crankOptedOut, fetchMarkets, OpsSendError, positionsOf, redeemForCall, sendOps, settleCall, sweepExpiredCall, venueOf, voidExpiredCall, type MarketView } from "@cwf/markets/ops";
import { errorText, runActor, roleKey, type VenueDeps } from "../../runtime";
import { decideSettle, PRINT_POLL_SEC, type SettleAction } from "./decide";
import { vaultCranker } from "./vault-crank";

const PASS_MS = 5_000;
const MAX_SENDS_PER_PASS = 24;
const REDEEM_GRACE_SEC = Number(process.env.SETTLER_REDEEM_GRACE_SEC) >= 0 && process.env.SETTLER_REDEEM_GRACE_SEC ? Number(process.env.SETTLER_REDEEM_GRACE_SEC) : 300;
/** "Someone got there first" or "not yet": look again rather than count a failure. */
const BENIGN = new Set(["MarketAlreadyTerminal", "NothingToRedeem", "CrossCheckPending", "SettlementWindowOpen", "PrintsMissing", "CrankRefused"]);

type Work = { market: string; checkAtSec: number; done: boolean };

export function startSettler(deps: VenueDeps): { stop: () => void } {
  if (!deps.sql) throw new Error("the settler reads its worklist from the index: DATABASE_URL is required");
  const sql = deps.sql;
  const key = roleKey("settler", deps.env.network, process.env, deps.env.keysDir);
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl, privateKey: key, tier: 0 });
  const venue = venueOf(client.chainId);
  if (!venue) throw new Error(`no engine fragment for chain ${client.chainId}`);
  const dryRun = deps.env.dryRun || !key;
  if (!key) deps.log("SETTLER_PRIVATE_KEY / settler.json missing: scanning and reporting only");
  const vault = vaultCranker(client, sql, dryRun);
  const work = new Map<string, Work>();
  // Windows found done (or unknown to this engine) this process: the index can keep listing them (a position it still
  // counts unredeemed that the chain paid out), and re-adding them every pass starved the Windows that need settling
  // (2026-10-09: 500+ Windows with both prints in sat unresolved behind them). Cleared on restart.
  const finished = new Set<string>();
  const optedOut = new Set<string>();
  const counts: Record<string, number> = {};
  let recent: Array<{ action: string; market: string; tx: string }> = [];

  const candidates = async (nowSec: number): Promise<string[]> => {
    const rows = await sql<{ market: string }[]>`
      select m.market from idx_markets m where m.opened_tx is not null and (
        (m.state = 'open' and least(m.expiry_sec, m.open_deadline_sec) <= ${nowSec})
        or (m.state <> 'open' and (exists (select 1 from idx_positions p where p.market = m.market and not p.redeemed)
                                   or exists (select 1 from idx_orders o where o.market = m.market and o.status = 'open'))))
      order by (m.state = 'open') desc, m.expiry_sec limit 500`;
    return rows.map((r) => r.market).filter((m) => !finished.has(m));
  };

  const holdersOf = async (m: MarketView): Promise<Address[]> => {
    const rows = await sql<{ owner: string }[]>`select owner from idx_positions where market = ${m.marketId.toLowerCase()} and not redeemed
      union select owner from idx_orders where market = ${m.marketId.toLowerCase()} and status = 'open'`;
    const owners = rows.map((r) => r.owner as Address).filter((o) => !optedOut.has(o));
    if (owners.length === 0) return [];
    const [positions, outs] = await Promise.all([positionsOf(client, venue, m.marketId, owners), crankOptedOut(client, venue, owners)]);
    outs.forEach((o, i) => o && optedOut.add(owners[i]!));
    return owners.filter((_, i) => !outs[i] && Object.values(positions[i]!).some((v) => v !== 0n && v !== 0));
  };

  const send = async (action: Exclude<SettleAction, { kind: "wait" } | { kind: "done" }>, m: MarketView, budget: { sends: number }): Promise<string> => {
    const id = m.marketId as Hex;
    const calls =
      action.kind === "settle" ? [settleCall(venue.engine, id)]
      : action.kind === "void" ? [voidExpiredCall(venue.engine, id)]
      : action.kind === "sweep" ? [sweepExpiredCall(venue.engine, id, 32)]
      : action.holders.map((h) => redeemForCall(venue.engine, id, h as Address));
    const tag = `${action.kind} ${id.slice(0, 10)} #${m.index}`;
    if (dryRun) return `DRY ${tag}: ${action.why}`;
    const out: string[] = [];
    await Promise.all(calls.map(async (call) => {
      if (budget.sends <= 0) return;
      budget.sends--;
      try {
        const sent = await sendOps(client, [call]);
        counts[action.kind] = (counts[action.kind] ?? 0) + 1;
        recent = [{ action: action.kind, market: id, tx: sent.hash }, ...recent].slice(0, 20);
        out.push(sent.hash.slice(0, 10));
      } catch (error) {
        const name = error instanceof OpsSendError ? error.errorName : null;
        if (name && BENIGN.has(name)) out.push(name);
        else {
          counts.failed = (counts.failed ?? 0) + 1;
          out.push(`failed: ${errorText(error).slice(0, 140)}`);
        }
      }
    }));
    return `${tag}: ${action.why} · ${out.join(", ")}`;
  };

  /** The Window's policy version's check source, read once per (Series, version). */
  const checks = new Map<string, { configured: boolean; admissionSec: number }>();
  const checkOf = async (m: MarketView) => {
    const k = `${m.seriesIdx}:${m.policyVersion}`;
    const hit = checks.get(k);
    if (hit) return hit;
    const seriesId = (await client.public.readContract({ address: venue.lens, abi: engineLensAbi, functionName: "seriesIdAt", args: [m.seriesIdx] })) as Hex;
    const v = (await client.public.readContract({ address: venue.lens, abi: engineLensAbi, functionName: "policyOf", args: [seriesId, m.policyVersion] })) as { checkAdmissionSec: number; check: { source: number } };
    const out = { configured: v.check.source !== 0, admissionSec: v.checkAdmissionSec };
    checks.set(k, out);
    return out;
  };

  const pass = async () => {
    const nowSec = await chainNowSec(client);
    for (const market of await candidates(nowSec)) if (!work.has(market)) work.set(market, { market, checkAtSec: 0, done: false });
    const due = [...work.values()].filter((w) => !w.done && w.checkAtSec <= nowSec).slice(0, 200);
    const views = await fetchMarkets(client, venue, due.map((w) => w.market as Hex));
    const budget = { sends: MAX_SENDS_PER_PASS };
    const notes: string[] = [];
    for (const [i, w] of due.entries()) {
      const m = views[i];
      if (!m) {
        w.done = true;
        finished.add(w.market);
        continue;
      }
      const check = await checkOf(m);
      const redeemable = m.state !== 0 && m.orderCount === 0 ? await holdersOf(m) : [];
      const action = decideSettle({
        nowSec, state: m.state, expirySec: m.expirySec, lockAtSec: m.lockAtSec, openDeadlineSec: m.openDeadlineSec, closeDeadlineSec: m.closeDeadlineSec,
        prints: { open: m.prints.open.source !== 0, close: m.prints.close.source !== 0, checkOpen: m.prints.checkOpen.source !== 0, checkClose: m.prints.checkClose.source !== 0 },
        check, resolvedSec: m.resolvedTsSec, redeemGraceSec: REDEEM_GRACE_SEC, orderCount: m.orderCount, redeemable,
      });
      if (action.kind === "done") {
        w.done = true;
        finished.add(w.market);
        continue;
      }
      if (action.kind === "wait") {
        // A wait whose moment has passed (a print due a while ago) is looked at again on the print poll, not every pass.
        w.checkAtSec = Math.max(action.untilSec, nowSec + PRINT_POLL_SEC);
        continue;
      }
      if (budget.sends <= 0) break;
      notes.push(await send(action, m, budget));
      w.checkAtSec = nowSec + 3;
    }
    if (vault && budget.sends > 0) notes.push(await vault.pass(budget).catch((error) => `vault crank pass failed: ${errorText(error).slice(0, 140)}`));
    for (const [k, w] of work) if (w.done) work.delete(k);
    const next = [...work.values()].map((w) => w.checkAtSec).filter((s) => s > nowSec);
    return {
      why: `${work.size} Windows tracked · ${due.length} due · ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing sent yet"}${vault ? ` · vault cranked ${vault.counts.cranked}` : " · vault crankSettle: vault not deployed"}${notes.length ? ` | ${notes.join(" | ")}` : ""}${dryRun ? " · DRY RUN" : ""}`,
      detail: { tracked: work.size, counts: { ...counts }, recent, optedOut: [...optedOut], vault: vault ? { counts: { ...vault.counts }, recent: vault.recent } : "not deployed" },
      nextDelayMs: budget.sends <= 0 ? 500 : next.length ? Math.max(1_000, Math.min(PASS_MS, (Math.min(...next) - nowSec) * 1000)) : PASS_MS,
    };
  };
  deps.log(`settler ${client.address ?? "(no key)"}, claim grace ${REDEEM_GRACE_SEC} s`);
  return runActor({ name: "settler", log: deps.log, dryRun, everyMs: PASS_MS, pass });
}
