#!/usr/bin/env -S pnpm exec tsx
/**
 * R4-1 (D-227) live proof that a position never leaves equity at its Window's answer and comes back at the payout. A
 * fresh wallet buys one contract of each side of a Window about to lock (a hedge, so the answer pays exactly one
 * contract whichever side wins, half of each on a void), then the app's own reads are logged at each phase — trading,
 * locked, answered (the settler's 300 s claim grace: the payout waits, `getBalanceSheet().collectBase`), and paid:
 *   equity = wallet + Σ open rows at what they count for (locked: their open cost) + what waits to be collected
 * The rows leave at the answer and the collect leg takes their payout in the same read as the wallet's balance, so
 * equity moves by the round's real P&L (cost → payout), never by the whole position. Reads are the app's; the buys are
 * the app's own calls (`walletOrderCalls`, what the terminal's one tap signs). Throwaway key in a 0600 file.
 *
 *   pnpm --dir scripts exec tsx drive/pnl-answer-live.ts [--max-lock-sec 420]
 */
import { createMarketsProvider, decodeEngineEvents, nowSec, walletOrderCalls } from "@cwf/markets";
import { toMarketId, type Address } from "@cwf/core";
import { encodeFunctionData, erc20Abi } from "viem";
import { PATH_USD, castBatch } from "../lib/cast.js";
import { balanceOf, fund, wallet } from "./lib/actors.js";
import { label, liveWindows, testnetVenue } from "./lib/live-windows.js";

const arg = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1]! : fallback);
const MAX_LOCK_SEC = Number(arg("--max-lock-sec", "420"));
const out = (step: string, data: Record<string, unknown>) => console.log(JSON.stringify({ step, atSec: nowSec(), ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const provider = createMarketsProvider();
await provider.syncClock();
const { client: ops, venue } = testnetVenue();

// The soonest-locking Window with 45 s to its lock and a house ask on both sides.
let w: Awaited<ReturnType<typeof liveWindows>>[number] | undefined;
for (const until = Date.now() + 10 * 60_000; Date.now() < until && !w; await sleep(w ? 0 : 10_000)) {
  const all = await liveWindows(ops, venue, nowSec());
  w = all.filter((x) => x.market.lockAtSec - nowSec() > 45 && x.market.lockAtSec - nowSec() < MAX_LOCK_SEC && x.top.askLots > 0n && x.top.bidLots > 0n).sort((a, b) => a.market.lockAtSec - b.market.lockAtSec)[0];
}
if (!w) throw new Error(`no Window locking within ${MAX_LOCK_SEC} s with both sides quoted`);
const marketId = w.market.marketId;
const lots = w.series.minLots > 1000n ? w.series.minLots : 1000n;
out("window", { window: label(w), marketId, lockAtSec: w.market.lockAtSec, expirySec: w.market.expirySec, top: w.top, lots });

const trader = wallet("pnl-answer");
// The faucet first; when it refuses (it answered 413 on 2026-10-13), $3 of the deployer role's testnet pathUSD.
await fund(trader.address).catch(async () => {
  const send = castBatch([{ to: PATH_USD, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [trader.address, 3_000_000n] }) }], { signer: { role: "deployer" } });
  if (send.status !== "0x1" && send.status !== "1" && send.status !== "success") throw new Error(`funding reverted: ${send.transactionHash}`);
  out("funded", { from: "deployer", tx: send.transactionHash });
});
out("trader", { address: trader.address });

// Up at the YES ask; Down at its own price, the complement of the YES bid.
const upTicks = w.top.askTicks;
const downTicks = 1000 - w.top.bidTicks;
const calls = [
  ...walletOrderCalls({ engine: venue.engine, collateral: PATH_USD, marketId, side: "up", ownLimitTicks: upTicks, lots, maxCostBase: lots * BigInt(upTicks) * w.series.cashUnit, creditBase: 0n, expireTsSec: w.market.lockAtSec, clientId: 1n }),
  ...walletOrderCalls({ engine: venue.engine, collateral: PATH_USD, marketId, side: "down", ownLimitTicks: downTicks, lots, maxCostBase: lots * BigInt(downTicks) * w.series.cashUnit, creditBase: 0n, expireTsSec: w.market.lockAtSec, clientId: 2n }),
];
const r = castBatch(calls, { signer: { walletFile: trader.file } });
if (r.status !== "0x1" && r.status !== "1" && r.status !== "success") throw new Error(`buy reverted: ${r.transactionHash}`);
const fills = decodeEngineEvents(venue.engine, r.logs as never).executed.map((e) => ({ filledLots: e.result.filledLots, cashSpent: e.result.cashSpent }));
out("buy", { tx: r.transactionHash, fills });
const cost = fills.reduce((s, f) => s + f.cashSpent, 0n);

/** One phase's figures from the app's own reads, and what equity counts. */
async function phase(name: string) {
  const [sheet, rows, claims, market] = await Promise.all([provider.getBalanceSheet(trader.address as Address), provider.listOpenPositions(trader.address as Address), provider.listClaimables(trader.address as Address), provider.getMarket(toMarketId(marketId))]);
  const row = rows.ok ? rows.value.find((p) => p.marketId.toLowerCase() === marketId.toLowerCase()) : undefined;
  const wallet = sheet.ok ? sheet.value.spendableBase : null;
  const collect = sheet.ok ? sheet.value.collectBase : null;
  const state = market.ok && market.value ? market.value.state : null;
  // Rows at their open cost here (locked; a trading row's exit walk is the terminal's — at the open cost for this sum).
  const rowsAtCost = row ? row.costBasisBase : 0n;
  out(name, { state, wallet, collect, ...(sheet.ok ? {} : { sheetError: sheet.error.kind }), claimables: claims.ok ? claims.value.reduce((s, c) => s + c.netPayoutBase, 0n) : null, row: row ? { up: row.balanceUpRaw, down: row.balanceDownRaw, openCost: row.costBasisBase } : null, equityAtCost: wallet === null || collect === null ? null : wallet + rowsAtCost + collect, onChainWallet: await balanceOf(trader.address) });
  return { state, wallet, collect, row };
}

await phase("trading");
while (nowSec() < w.market.lockAtSec + 2) await sleep(2_000);
await phase("locked");
// The answer: the settler resolves the Window once its close print allows.
let p = await phase("waiting");
for (const until = Date.now() + 15 * 60_000; Date.now() < until && p.state === "open"; ) {
  await sleep(5_000);
  p = await phase("waiting");
}
if (p.state === "open") throw new Error("the Window did not resolve within 15 minutes");
const answered = await phase("answered");
// Paid: the settler redeems after its claim grace (300 s), or nothing waits.
let paid = answered;
for (const until = Date.now() + 15 * 60_000; Date.now() < until && (paid.collect ?? 0n) > 0n; ) {
  await sleep(10_000);
  paid = await phase("grace");
}
await phase("paid");
out("summary", { cost, paysOne: lots * w.series.lotBase, note: "equity moves by payout − cost at the answer; collect hands over to the wallet at the payout" });
process.exit(0);
