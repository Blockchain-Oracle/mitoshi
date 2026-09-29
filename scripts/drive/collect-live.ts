/**
 * S4.4 live proof on Moderato against live S3 5-minute Windows: cash-out, auto-pay with the verdict pinned to the
 * position, the held-by-receive-policy state, and claim-all in one sponsored batch.
 *
 *   u3 (auto-paid): taps both sides of W1, cashes half of its Up back out before lock (SELL IOC), then leaves the
 *       rest to the S3 settler's `redeemFor` after grace → pinned verdict "paid", paid automatically;
 *   u2 (held): blacklists the engine as a sender in its TIP-403 receive policy and holds both sides of W1 → the
 *       settler's `redeemFor` holds the payout as credit → claimables and verdict say "held"; claim-all leaves it out;
 *       it lifts the policy → claim-all withdraws the credit → verdict "paid";
 *   u1 (collector): opts out of the crank (sponsored `setCrankOptOut`) and trades every Window → after settlement its
 *       leftovers are collected by ONE claim-all transaction (`redeem × n`).
 *
 *   pnpm --filter @cwf/scripts exec tsx drive/collect-live.ts
 */
import { encodeFunctionData, type Address, type Hex } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import type { EventMarket, MarketId, Side } from "@cwf/core";
import { claimAllInputOf, createMarketsProvider, createSubmitterSession, FULL_TEMPO_CAPS, nowSec, readPositions, redeemedEvents, sendBatch } from "@cwf/markets";
import { createdPolicyId, driveClient, newPasskeyRoot, receivePolicyCalls } from "@cwf/markets/drive";
import { balanceOf, fund, reader, restInside, wallet } from "./lib/actors";
import { label, liveWindows, rawTop, testnetVenue } from "./lib/live-windows";
import { startLocalRelay } from "./lib/relay-server";

const out = (step: string, data: Record<string, unknown>) => console.log(JSON.stringify({ step, atSec: nowSec(), ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const relay = await startLocalRelay();
const provider = createMarketsProvider();
await provider.syncClock();
const { client: ops, venue } = testnetVenue();

// Fresh 5-minute Windows with their open print and ≥ 200 s to lock (the setup takes ~90 s); wait up to 8 minutes.
let windows: Awaited<ReturnType<typeof liveWindows>> = [];
for (const until = Date.now() + 8 * 60_000; Date.now() < until; await sleep(10_000)) {
  windows = (await liveWindows(ops, venue, nowSec())).filter((w) => w.series.cadenceSec === 300 && w.market.lockAtSec - nowSec() > 200).slice(0, 3);
  if (windows.length >= 2) break;
}
if (windows.length < 2) throw new Error("need two live 5-minute Windows with an open print and 200 s to lock");
out("windows", { windows: windows.map((w) => ({ window: label(w), marketId: w.market.marketId, lockAtSec: w.market.lockAtSec, expirySec: w.market.expirySec })) });

const maker = wallet("collect-maker");
await fund(maker.address);
const quoted: typeof windows = [];
for (const w of windows) {
  const r = await restInside(maker, venue.engine, w.market.marketId, w.market.lockAtSec, { ask: 20_000n, bid: 20_000n }, () => rawTop(ops, venue, w.market.marketId));
  out("maker", r ? { window: label(w), tx: r.receipt.transactionHash, askYes: r.askYes, bidYes: r.bidYes } : { window: label(w), skipped: "the book kept moving across the quotes" });
  if (r) quoted.push(w);
}
windows = quoted;
if (windows.length < 2) throw new Error("fewer than two Windows could be quoted");
await sleep((windows[0]!.series.minRestSec + 3) * 1000);

const user = async (name: string) => {
  const root = newPasskeyRoot();
  await fund(root.address);
  const client = driveClient(root.account as never, relay.url);
  const session = createSubmitterSession({ authority: "passkey", client, caps: FULL_TEMPO_CAPS, nowSec });
  out("user", { name, address: root.address });
  return { name, root, client, session };
};
type User = Awaited<ReturnType<typeof user>>;
const [u1, u2, u3] = [await user("u1-collector"), await user("u2-held"), await user("u3-auto")];
const markets = new Map<MarketId, EventMarket>();
for (const w of windows) {
  const m = await provider.getMarket(w.market.marketId as MarketId);
  if (m.ok && m.value) markets.set(m.value.marketId, m.value);
}
const [w1, ...rest] = [...markets.values()];

async function tap(u: User, m: EventMarket, side: Side, stakeBase = 1_000_000n) {
  const q = await provider.freshQuoteStake({ marketId: m.marketId, decimals: 6, intervalSec: m.intervalSec }, side, stakeBase);
  if (!q.ok || !q.value) return out("tap", { user: u.name, market: m.marketId, side, quote: q.ok ? null : q.error });
  const o = await u.session.submitter.submitOrder({ market: m, side, stakeBase, displayedQuote: q.value, wallet: u.root.address });
  out("tap", { user: u.name, market: m.marketId, side, status: o.status, ...(o.status === "confirmed" ? { tx: o.booked.txHash, contractsRaw: o.booked.contractsRaw, costBase: o.booked.costBase, feePayer: ((await reader.getTransactionReceipt({ hash: o.booked.txHash })) as { feePayer?: string }).feePayer } : { o }) });
}
async function send(u: User, name: string, calls: { to: Address; data: Hex }[], sponsored: boolean) {
  const sent = await sendBatch(u.client, { calls, sponsored, nonce: { kind: "expiring" }, nowSec: nowSec() });
  out("send", { user: u.name, name, tx: sent.hash, status: sent.receipt.status, feePayer: (sent.receipt as { feePayer?: string }).feePayer });
  return sent;
}

// u1: opt out of the settler's auto-pay (sponsored exit-class call), then trade every Window.
await send(u1, "setCrankOptOut(true)", [{ to: venue.engine, data: encodeFunctionData({ abi: eventsEngineAbi, functionName: "setCrankOptOut", args: [true] }) }], true);
await tap(u1, w1!, "up");
await tap(u1, w1!, "down");
for (const m of rest) await tap(u1, m, "up");

// u2: block the engine as a sender in its receive policy (self-paid: TIP-403 is not a sponsored area), hold both sides.
const created = await send(u2, "createPolicyWithAccounts(BLACKLIST, [engine])", [receivePolicyCalls.createBlacklist(u2.root.address, venue.engine)], false);
const policyId = createdPolicyId(created.receipt.logs as never)!;
await send(u2, `setReceivePolicy(${policyId}, always-allow tokens, recovery = self)`, [receivePolicyCalls.setReceivePolicy(policyId, u2.root.address)], false);
await tap(u2, w1!, "up");
await tap(u2, w1!, "down");

// u3: both sides, then cash half of the Up back out before lock.
await tap(u3, w1!, "up", 2_000_000n);
await tap(u3, w1!, "down");
const [p3] = await readPositions(u3.root.address, [w1!.marketId]);
const half = ((p3?.yesFree ?? 0n) / 2n) * 1000n;
const exit = await provider.freshExitQuote({ marketId: w1!.marketId, decimals: 6 }, "up", half);
if (exit.ok && exit.value) {
  const sold = await u3.session.submitter.submitCashOut({ market: w1!, side: "up", contractsRaw: half, displayedExit: exit.value, wallet: u3.root.address });
  out("cash-out", { exit: exit.value, status: sold.status, ...(sold.status === "confirmed" ? { booked: sold.booked, feePayer: ((await reader.getTransactionReceipt({ hash: sold.booked.txHash })) as { feePayer?: string }).feePayer } : { sold }) });
} else out("cash-out", { exit: exit.ok ? null : exit.error });

// Settlement: wait for every Window to be terminal, then for the settler's auto-pay of u3 and hold of u2 (≤ 15 min).
const verdict = async (u: User, m: EventMarket) => {
  const v = await provider.getPinnedVerdict(u.root.address, m.marketId);
  return v.ok ? v.value : { error: v.error };
};
out("verdict-before", { u3: await verdict(u3, w1!) });
const deadline = Date.now() + 20 * 60_000;
for (;;) {
  const snaps = await Promise.all([...markets.keys()].map((id) => provider.getOnchain(id)));
  const terminal = snaps.every((s) => s.ok && s.value.state !== "open");
  const [r2, r3] = await Promise.all([redeemedEvents(u2.root.address, w1!.marketId), redeemedEvents(u3.root.address, w1!.marketId)]);
  if (terminal && r2.length > 0 && r3.length > 0) {
    out("settled", { states: snaps.map((s) => (s.ok ? { state: s.value.state, winner: s.value.winningOutcome } : s.error)), u2Redeemed: r2, u3Redeemed: r3 });
    break;
  }
  if (Date.now() > deadline) throw new Error(`not settled/auto-paid in time: terminal=${terminal} u2=${r2.length} u3=${r3.length}`);
  await sleep(20_000);
}

// u3: the verdict pinned to its position, paid automatically.
out("u3-verdict", { verdict: await verdict(u3, w1!), balance: await balanceOf(u3.root.address) });

// u2: held → claim-all leaves it out → lift the policy → claim-all withdraws the credit.
const held = await provider.listClaimables(u2.root.address);
out("u2-held", { claimables: held.ok ? held.value : held.error, verdict: await verdict(u2, w1!), claimAll: held.ok ? claimAllInputOf(venue.engine, held.value) : null });
await send(u2, "unblock the engine", [receivePolicyCalls.unblock(policyId, venue.engine)], false);
const freed = await provider.listClaimables(u2.root.address);
if (freed.ok) {
  const before = await balanceOf(u2.root.address);
  const input = claimAllInputOf(venue.engine, freed.value);
  const claimed = await u2.session.submitter.submitTx({ kind: "claim-all", redeem: [...input.redeem], credits: [...input.credits] });
  out("u2-claim", { claimables: freed.value, outcome: claimed, gained: (await balanceOf(u2.root.address)) - before, verdict: await verdict(u2, w1!) });
}

// u1: every leftover in one claim-all.
const mine = await provider.listClaimables(u1.root.address);
if (mine.ok) {
  const before = await balanceOf(u1.root.address);
  const input = claimAllInputOf(venue.engine, mine.value);
  const claimed = await u1.session.submitter.submitTx({ kind: "claim-all", redeem: [...input.redeem], credits: [...input.credits] });
  const after = await provider.listClaimables(u1.root.address);
  out("u1-claim-all", { claimables: mine.value, input, outcome: claimed, gained: (await balanceOf(u1.root.address)) - before, after: after.ok ? after.value : after.error, verdicts: await Promise.all([...markets.values()].map((m) => verdict(u1, m))) });
}
out("verdicts", { relay: relay.verdicts.map((v) => `${v.method}:${v.verdict.ok ? "ok" : v.verdict.code}`) });
await relay.close();
process.exit(0);
