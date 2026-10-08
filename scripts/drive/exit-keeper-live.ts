/**
 * S24.3 live check on Moderato (D-193, D-209): exits that run with no app open, against the deployed `/api/exits` and
 * the deployed ops `exit-keeper`. A passkey-shaped root arms a Trading Balance session (v2) and grants EXIT to the
 * keeper; the browser-shaped session key (WebCrypto P-256) taps through the production relay and signs the triggers.
 * No tab is involved: everything after the POST is the keeper's.
 *
 *   1. A trigger signed by a stranger's key is refused (403); a sale under the floor reverts (`BelowFairFloor`).
 *   2. Up $1, then a take-profit any value meets: the keeper sells it — the position goes to 0 and the vault's
 *      `Executed` names the keeper.
 *   3. Down $1, then a trail: with `--restart`, a far stop is stored first and the run waits for ops to restart
 *      (`/health` shows a new start), then a newer trigger puts the stop 3 bps over the spot — it fires after the restart.
 *
 *   pnpm --filter @cwf/scripts exec tsx drive/exit-keeper-live.ts [--base https://testnet.mitoshi.xyz] [--ops https://ops.testnet.mitoshi.xyz] [--restart] [--lane crypto24]
 */
import { encodeFunctionData, zeroHash, type Address, type Hex } from "viem";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import type { EventMarket, MarketId, Side } from "@cwf/core";
import { exitTriggerToWire, exitTriggerTypedData, type ExitTrigger } from "@cwf/core/exits";
import { createMarketsProvider, createSubmitterSession, FULL_TEMPO_CAPS, generateSessionKey, nowSec, sendBatch, sessionKeyAccount, sessionKeySession, vaultDeploymentOf, vaultOutcomeId } from "@cwf/markets";
import { driveClient, newPasskeyRoot } from "@cwf/markets/drive";
import { engineErrorName, exitForCall, exitLimitOwnTicks, exitVenueOf, guardFeedOf, readExitFloorRaw } from "@cwf/markets/ops";
import { fund, reader } from "./lib/actors";
import { label, liveWindows, testnetVenue } from "./lib/live-windows";
import { startLocalRelay } from "./lib/relay-server";
import { latestSpot } from "./lib/spot";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const BASE = arg("base", "https://testnet.mitoshi.xyz");
const OPS = arg("ops", "https://ops.testnet.mitoshi.xyz");
const RESTART = process.argv.includes("--restart");
/** `--lane crypto24`: a lively Window for the trail (BTC moves bps in seconds; a stock after hours may not move 0.1 %). */
const LANE = arg("lane", "");
const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const ONE = 1_000_000n;
const out = (step: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ step, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Health = { actors: Array<{ actor: string; startedMs: number; lastWhy: string; detail: { keeper?: Address; recent?: Array<{ owner: string; tx: string; reason: string; proceedsBase: string }> } }> };
const keeperBeat = async () => ((await (await fetch(`${OPS}/health`)).json()) as Health).actors.find((a) => a.actor === "exit-keeper");

const relay = await startLocalRelay();
const provider = createMarketsProvider();
await provider.syncClock();
const { client: ops, venue } = testnetVenue();
const v2 = vaultDeploymentOf(42431)!;
if (v2.version !== 2) throw new Error("the current Trading Balance is not v2");
const ev = (await exitVenueOf(ops, venue))!;
const beat = await keeperBeat();
if (!beat?.detail.keeper) throw new Error(`the exit keeper isn't running on ${OPS}: ${beat?.lastWhy ?? "absent"}`);
const keeper = beat.detail.keeper;
out("keeper", { keeper, vault: ev.vault, guard: ev.guard, why: beat.lastWhy });

// The quoted Window with the most time to lock (a restart needs minutes: a 15m or 60m Window when one is quoted), waiting
// up to 6 minutes for one with enough.
const need = RESTART ? 600 : 240;
let target: Awaited<ReturnType<typeof liveWindows>>[number] | undefined;
for (const t0 = Date.now(); !target && Date.now() - t0 < 6 * 60_000; ) {
  target = (await liveWindows(ops, venue, nowSec())).filter((w) => (!LANE || w.series.lane === LANE) && w.market.lockAtSec - nowSec() > need && w.top.bidLots > 0n && w.top.askLots > 0n).sort((a, b) => b.market.lockAtSec - a.market.lockAtSec)[0];
  if (!target) await sleep(15_000);
}
if (!target) throw new Error(`no quoted Window with ${need}+ s to lock within 6 minutes`);
const marketId = target.market.marketId as MarketId;
const reading = await provider.getMarket(marketId);
if (!reading.ok || !reading.value) throw new Error("the Window did not read");
const market: EventMarket = reading.value;
const feed = (await guardFeedOf(ops, ev.guard, target.series.ticker))!;
out("window", { window: label(target), marketId, lockInSec: target.market.lockAtSec - nowSec(), feed });

// The owner arms (one self-paid tx) and grants EXIT to the keeper (one self-paid tx, never sponsored).
const root = newPasskeyRoot();
await fund(root.address);
const rootClient = driveClient(root.account as never, relay.url, RPC);
const owner = createSubmitterSession({ authority: "passkey", client: rootClient, caps: FULL_TEMPO_CAPS, nowSec }).submitter;
const key = await generateSessionKey(root.address);
const keyAccount = sessionKeyAccount(key) as unknown as { signTypedData: (d: ReturnType<typeof exitTriggerTypedData>) => Promise<Hex> };
const caps = { maxStakePerTradeBase: 2n * ONE, maxDailySpendBase: 5n * ONE, maxOpenPositions: 3, maxPriceRaw: 950_000n, market: null };
const arm = await owner.submitTx({ kind: "vault-deposit-and-grant", amountBase: 10n * ONE, terms: { kind: "session", actor: key.address, caps, expiresAtSec: nowSec() + 6 * 3600, budgetBase: 5n * ONE } });
if (arm.status !== "confirmed") throw new Error(`arm: ${JSON.stringify(arm)}`);
const vault = { address: v2.eventVault, abi: eventVaultV2Abi } as const;
const sessionGrant = (await reader.readContract({ ...vault, functionName: "activeGrantOf", args: [root.address, 0] })) as bigint;
const grantExit = await sendBatch(rootClient as never, { calls: [{ to: v2.eventVault, data: encodeFunctionData({ abi: eventVaultV2Abi, functionName: "grantExit", args: [keeper, zeroHash, BigInt(nowSec() + 6 * 3600), 1_500] }) }], sponsored: false, nonce: { kind: "expiring" }, nowSec: nowSec() });
const exitGrant = (await reader.readContract({ ...vault, functionName: "activeGrantOf", args: [root.address, 3] })) as bigint;
out("armed", { owner: root.address, key: key.address, armTx: arm.txHash, sessionGrant, grantExitTx: grantExit.hash, grantExitStatus: grantExit.receipt.status, exitGrant, toleranceBps: 1_500 });

const session = sessionKeySession({ record: key, network: "testnet", rpcHttpUrls: [RPC], relayUrl: relay.url, nowSec });
async function tap(side: Side): Promise<bigint> {
  const quote = await provider.freshQuoteStake({ marketId, decimals: 6, intervalSec: market.intervalSec }, side, ONE);
  if (!quote.ok || !quote.value) throw new Error(`no ${side} quote`);
  const r = await session.submitter.submitOrder({ market, side, stakeBase: ONE, displayedQuote: quote.value, wallet: session.address, route: { kind: "vault-grant", grantId: sessionGrant } });
  if (r.status !== "confirmed") throw new Error(`${side} tap: ${JSON.stringify(r)}`);
  out(`tap-${side}`, { tx: r.booked.txHash, contractsRaw: r.booked.contractsRaw, costBase: r.booked.costBase });
  return r.booked.contractsRaw;
}
const held = (side: Side) => reader.readContract({ ...vault, functionName: "positionOf", args: [root.address, vaultOutcomeId(marketId, side === "up" ? 0 : 1)] }) as Promise<bigint>;

async function post(t: ExitTrigger, signer: { signTypedData: (d: ReturnType<typeof exitTriggerTypedData>) => Promise<Hex> } = keyAccount) {
  const signature = await signer.signTypedData(exitTriggerTypedData(t));
  const res = await fetch(`${BASE}/api/exits`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trigger: exitTriggerToWire(t), signature }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const trigger = (side: Side, over: Partial<ExitTrigger>): ExitTrigger => ({
  owner: root.address, vault: v2.eventVault, chainId: 42431, market: marketId, side, grantId: sessionGrant,
  takeProfitBase: null, stopLossBase: null, trailBps: null, trailStopE8: null, nonce: BigInt(Date.now()), expiresAtSec: target.market.lockAtSec, ...over,
});

/** Waits for the keeper's sale of `side`: the position at 0 and the vault's `Executed` from the keeper. */
async function soldByKeeper(side: Side, fromBlock: bigint, maxMs: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if ((await held(side)) === 0n) {
      const logs = await reader.getContractEvents({ ...vault, eventName: "Executed", args: { owner: root.address }, fromBlock });
      const sale = logs.find((l) => !l.args.isBuy && l.args.actor?.toLowerCase() === keeper.toLowerCase() && l.args.outcomeIdx === (side === "up" ? 0 : 1));
      return { ms: Date.now() - t0, tx: sale?.transactionHash ?? null, block: sale?.blockNumber ?? null, proceedsBase: sale?.args.cashDelta ?? null, contractsRaw: sale?.args.tokenDelta ?? null, grantId: sale?.args.grantId ?? null };
    }
    await sleep(2_000);
  }
  return null;
}

// 1. The stranger and the floor.
await tap("up");
const stranger = sessionKeyAccount(await generateSessionKey(root.address)) as unknown as typeof keyAccount;
const forged = await post(trigger("up", { takeProfitBase: 1n }), stranger);
out("forged-trigger", { status: forged.status, error: forged.body.error });
if (forged.status !== 403) throw new Error(`a stranger's trigger was not refused: ${forged.status}`);
const spot = await latestSpot(feed);
const floorRaw = await readExitFloorRaw(ops, ev, exitGrant, marketId, "up", spot.payload);
const own = exitLimitOwnTicks(floorRaw, target.series.tickBase)!;
const below = exitForCall(v2.eventVault, { grantId: exitGrant, marketId, side: "up", ownTicks: own - 1, tickBase: target.series.tickBase, quantityRaw: target.series.lotBase, expireNs: BigInt(target.market.lockAtSec) * 1_000_000_000n, proof: spot.payload });
const refusal = await reader.call({ account: keeper, to: below.to, data: below.data }).then(() => "accepted", (e) => engineErrorName(e) ?? String(e).slice(0, 120));
out("below-floor", { floorRaw, limitOwnTicks: own, tried: own - 1, refusal });

// 2. A take-profit any value meets: the keeper sells with no tab open.
let from = await reader.getBlockNumber();
const tp = await post(trigger("up", { takeProfitBase: 1n }));
out("tp-posted", { status: tp.status, exit: tp.body.exit ?? tp.body.error });
if (tp.status !== 200) throw new Error(`the owner's own take-profit was refused: ${String(tp.body.error)}`);
out("tp-sold", { sale: await soldByKeeper("up", from, 120_000) });

// 3. A trail on Down, across an ops restart when asked.
await tap("down");
if (RESTART) {
  const far = await post(trigger("down", { trailBps: 10, trailStopE8: (spot.medianE8 * 12n) / 10n }));
  const started = (await keeperBeat())!.startedMs;
  out("trail-far-posted", { status: far.status, exit: far.body.exit ?? far.body.error, keeperStartedMs: started, note: "restart ops now" });
  if (far.status !== 200) throw new Error(`the owner's own trail was refused: ${String(far.body.error)}`);
  const t0 = Date.now();
  for (;;) {
    const b = await keeperBeat().catch(() => null);
    if (b && b.startedMs !== started) {
      out("keeper-restarted", { startedMs: b.startedMs, why: b.lastWhy });
      break;
    }
    if (Date.now() - t0 > 15 * 60_000) throw new Error("ops did not restart within 15 min");
    await sleep(5_000);
  }
  out("still-held", { downRaw: await held("down") });
}
const now = await latestSpot(feed);
from = await reader.getBlockNumber();
const near = await post(trigger("down", { trailBps: 10, trailStopE8: (now.medianE8 * 10_003n) / 10_000n }));
out("trail-posted", { status: near.status, exit: near.body.exit ?? near.body.error, spotE8: now.medianE8 });
if (near.status !== 200) throw new Error(`the owner's own trail was refused: ${String(near.body.error)}`);
out("trail-sold", { sale: await soldByKeeper("down", from, Math.max(30_000, (target.market.lockAtSec - nowSec() - 5) * 1000)) });
out("health", { why: (await keeperBeat())?.lastWhy });
await relay.close?.();
process.exit(0);
