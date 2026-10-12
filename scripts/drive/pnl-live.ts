#!/usr/bin/env -S pnpm exec tsx
/**
 * R4-1 (D-227) live proof of the P&L rule on Moderato: a fresh wallet buys a side of a live Window, sells part of it, buys
 * again (a re-entry at a new price), and the app's own reads — `listOpenPositions` (the open cost, per side) and `freshExitQuote` (what Close pays: the exit
 * walk), the reads the terminal and /portfolio show — are checked against the chain itself: the two receipts'
 * `OrderExecuted` (lots filled, cash spent, cash received) and the lens balance.
 *   open cost = first cost × (bought − sold) ÷ bought + the re-entry's cost   (average cost: the sale took its share)
 *   realised  = cash received − first cost × sold ÷ bought
 *   P&L now   = what Close pays for what is held − open cost
 * A second fresh wallet rests a bid and an ask inside the spread first (`restInside`), so the trade never depends on
 * the house maker's depth. The trader's calls are the app's own (`walletOrderCalls`, `cashOutCall`: what the terminal's
 * one-tap and Close sign). Throwaway keys in 0600 files (never printed); every step is a real Tempo transaction.
 *
 *   pnpm --dir scripts exec tsx drive/pnl-live.ts [--lots 2000] [--sell 1000] [--again 1000]
 */
import { cashOutCall, createMarketsProvider, decodeEngineEvents, nowSec, walletOrderCalls } from "@cwf/markets";
import type { MarketId } from "@cwf/core";
import { PATH_USD, castBatch, type CastReceipt } from "../lib/cast.js";
import { fund, restInside, wallet } from "./lib/actors.js";
import { label, liveWindows, rawTop, testnetVenue } from "./lib/live-windows.js";

const arg = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1]! : fallback);
const LOTS = BigInt(arg("--lots", "2000"));
const SELL = BigInt(arg("--sell", String(LOTS / 2n)));
const AGAIN = BigInt(arg("--again", String(LOTS / 2n)));
const out = (step: string, data: Record<string, unknown>) => console.log(JSON.stringify({ step, atSec: nowSec(), ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (r: CastReceipt, step: string) => {
  if (r.status !== "0x1" && r.status !== "1" && r.status !== "success") throw new Error(`${step} reverted: ${r.transactionHash}`);
  return r;
};

const provider = createMarketsProvider();
await provider.syncClock();
const { client: ops, venue } = testnetVenue();

// A Window with its open print and room to buy, sell and read before it locks (most time left first).
let w: Awaited<ReturnType<typeof liveWindows>>[number] | undefined;
for (const until = Date.now() + 6 * 60_000; Date.now() < until && !w; await sleep(w ? 0 : 10_000)) {
  w = (await liveWindows(ops, venue, nowSec())).find((x) => x.market.lockAtSec - nowSec() > 150);
}
if (!w) throw new Error("no live Window with 150 s to lock");
const marketId = w.market.marketId;
out("window", { window: label(w), marketId, lockAtSec: w.market.lockAtSec, lotBase: w.series.lotBase, cashUnit: w.series.cashUnit, minRestSec: w.series.minRestSec });

const maker = wallet("pnl-maker");
await fund(maker.address);
const rested = await restInside(maker, venue.engine, marketId, w.market.lockAtSec, { ask: LOTS * 2n, bid: LOTS * 2n }, () => rawTop(ops, venue, marketId));
if (!rested) throw new Error("the book kept moving across the maker's quotes");
out("maker", { address: maker.address, tx: rested.receipt.transactionHash, askYes: rested.askYes, bidYes: rested.bidYes });
await sleep((w.series.minRestSec + 3) * 1000);

const trader = wallet("pnl-trader");
await fund(trader.address);
out("trader", { address: trader.address });

// The terminal's one-tap Up at the maker's ask (an exact approve, then the IOC) and its Close for part, proceeds withdrawn.
const send = (calls: readonly { to: `0x${string}`; data: `0x${string}` }[], step: string) => ok(castBatch(calls, { signer: { walletFile: trader.file } }), step);
const buyCalls = (lots: bigint, clientId: bigint) =>
  walletOrderCalls({ engine: venue.engine, collateral: PATH_USD, marketId, side: "up", ownLimitTicks: rested.askYes, lots, maxCostBase: lots * BigInt(rested.askYes) * w.series.cashUnit, creditBase: 0n, expireTsSec: w.market.lockAtSec, clientId });
const buyR = send(buyCalls(LOTS, 1n), "buy");
const buy = decodeEngineEvents(venue.engine, buyR.logs as never).executed[0]!;
out("buy", { tx: buyR.transactionHash, filledLots: buy.result.filledLots, cashSpent: buy.result.cashSpent, fills: buy.result.fills });
const sellR = send([cashOutCall(venue.engine, { marketId, side: "up", ownLimitTicks: rested.bidYes, lots: SELL, expireTsSec: w.market.lockAtSec, clientId: 2n })], "sell");
const sell = decodeEngineEvents(venue.engine, sellR.logs as never).executed[0]!;
out("sell", { tx: sellR.transactionHash, filledLots: sell.result.filledLots, cashReceived: sell.result.cashReceived, fills: sell.result.fills });
const againR = AGAIN > 0n ? send(buyCalls(AGAIN, 3n), "again") : null;
const again = againR ? decodeEngineEvents(venue.engine, againR.logs as never).executed[0]! : null;
if (againR && again) out("again", { tx: againR.transactionHash, filledLots: again.result.filledLots, cashSpent: again.result.cashSpent, fills: again.result.fills });

// The chain's own figures.
const lotBase = w.series.lotBase;
const bought = buy.result.filledLots;
const sold = sell.result.filledLots;
const heldRaw = (bought - sold + (again?.result.filledLots ?? 0n)) * lotBase;
const openCost = (buy.result.cashSpent * (bought - sold)) / bought + (again?.result.cashSpent ?? 0n);
const realized = sell.result.cashReceived - (buy.result.cashSpent * sold) / bought;

// The app's figures, once the index has both fills (the lens balance is head-fresh; the cost waits for the index).
let row: Awaited<ReturnType<typeof provider.listOpenPositions>> | null = null;
for (let i = 0; i < 30; i++) {
  row = await provider.listOpenPositions(trader.address);
  const p = row.ok ? row.value.find((x) => x.marketId.toLowerCase() === marketId.toLowerCase()) : undefined;
  if (p && !p.costStale && p.costBasisBase === openCost && p.balanceUpRaw === heldRaw) break;
  await sleep(3_000);
}
const p = row?.ok ? row.value.find((x) => x.marketId.toLowerCase() === marketId.toLowerCase()) : undefined;
if (!p) throw new Error("the app lists no position on the Window");
const exit = await provider.freshExitQuote({ marketId: marketId as MarketId, decimals: 6 }, "up", p.balanceUpRaw);
const proceeds = exit.ok && exit.value ? exit.value.proceedsBase : null;
const filled = exit.ok && exit.value ? exit.value.contractsRaw : null;
out("app", { heldUpRaw: p.balanceUpRaw, costBasisBase: p.costBasisBase, costUpBase: p.costUpBase, costStale: p.costStale, realizedPnlBase: p.realizedPnlBase, closePaysBase: proceeds, closeSellsRaw: filled, pnlBase: proceeds === null ? null : proceeds - p.costBasisBase, lastTradeMarkBase: p.markValueBase });
const gross = buy.result.cashSpent + (again?.result.cashSpent ?? 0n);
out("chain", { heldRaw, openCost, realized, grossCostWas: gross, oldPnlWouldBe: proceeds === null ? null : proceeds - gross });
out("match", { held: p.balanceUpRaw === heldRaw, openCost: p.costBasisBase === openCost, realized: p.realizedPnlBase === realized, wholeExit: filled === heldRaw });
