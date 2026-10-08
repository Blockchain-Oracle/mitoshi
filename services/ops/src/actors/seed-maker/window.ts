// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/market-maker/seat/window.ts — seats
// and Ledgers gone: the maker's orders and balances are `lens.openOrdersOf` / `positionOf`; escrow cancelled on a requote
// stays as the Window's credit and funds the next placement (`useCredit`).
/**
 * One Window's maker pass: pull, stop or (re)quote, merging paired inventory on the way. The bid is a PostOnly BUY_YES
 * at `bid`; the ask a PostOnly BUY_NO at YES price `ask` (escrows `1000 − ask`, fills through MINT_PAIR).
 */
import type { Address } from "viem";
import { cancelAllCall, KIND, mergeSetCall, openOrdersOf, OpsSendError, ORDER_TYPE, placeOrderCall, positionsOf, sendOps, topOfBook, type MarketView, type OpsClient, type SeriesView, type Venue } from "@cwf/markets/ops";
import type { SeedMakerEnv } from "./env";
import type { LaneQuote } from "./lanes";
import { needsRequote, quoteExpirySec, quotePair, sizeLots, tailLots, type Placed } from "./quote";

export interface WindowCtx {
  client: OpsClient;
  venue: Venue;
  env: SeedMakerEnv;
  dryRun: boolean;
  nowSec: number;
  log: (why: string) => void;
}

export type WindowResult = { state: "quoting" | "resting" | "pulled" | "stopped" | "idle"; placed: Placed | null; note: string; txs: string[] };

export async function tendWindow(ctx: WindowCtx, series: SeriesView, m: MarketView, lane: LaneQuote, placed: Placed | null, label: string): Promise<WindowResult> {
  const me = ctx.client.address as Address;
  const txs: string[] = [];
  const trading = m.state === 0 && m.tradingStartSec <= ctx.nowSec && ctx.nowSec < m.lockAtSec;
  if (!trading) return { state: "idle", placed: null, note: "not trading", txs };
  const fair = lane.phase === "quote" ? lane.fairTicks : null;
  const halfSpreadTicks = lane.halfSpreadTicks ?? ctx.env.halfSpreadTicks;
  if (fair !== null && placed && !needsRequote({ placed, fairTicks: fair, nowSec: ctx.nowSec, requoteTicks: ctx.env.requoteTicks, halfSpreadTicks, lockAtSec: m.lockAtSec })) return { state: "resting", placed, note: `fair ${fair}, resting`, txs };
  if (!placed && lane.phase !== "quote") return { state: lane.phase === "stop" ? "stopped" : "pulled", placed: null, note: lane.why, txs };
  if (!placed && fair === null) return { state: "idle", placed: null, note: lane.why, txs };
  const send = async (what: string, calls: Parameters<typeof sendOps>[1]) => {
    if (ctx.dryRun) return void ctx.log(`DRY ${what} ${label}`);
    const sent = await sendOps(ctx.client, calls);
    txs.push(sent.hash);
  };
  const [orders, [pos]] = await Promise.all([openOrdersOf(ctx.client, ctx.venue, m.marketId, me), positionsOf(ctx.client, ctx.venue, m.marketId, [me])]);
  const cancel = async (why: string) => {
    if (orders.length) await send(`cancelAll (${orders.length}) ${why}`, [cancelAllCall(ctx.venue.engine, m.marketId, 32, false)]);
  };
  if (lane.phase !== "quote") {
    // A stop near lock leaves what rests to expire at lock − 30 (no cancel fee); a pull cancels at once.
    if (lane.phase === "pull") await cancel(lane.why);
    return { state: lane.phase === "stop" ? "stopped" : "pulled", placed: null, note: lane.why, txs };
  }
  if (fair === null) {
    await cancel("no fair yet");
    return { state: "idle", placed: null, note: lane.why, txs };
  }
  // Paired inventory is a set: merge it back to cash (credit) so the escrow budget stays honest.
  if (pos && pos.yesFree > 0n && pos.noFree > 0n) {
    const lots = pos.yesFree < pos.noFree ? pos.yesFree : pos.noFree;
    await send(`mergeSet ${lots}`, [mergeSetCall(ctx.venue.engine, m.marketId, lots, false)]);
  }
  await cancel(placed ? `requote ${placed.fairTicks} → ${fair}` : "unknown resting orders");
  const top = await topOfBook(ctx.client, ctx.venue, m.marketId);
  const pair = quotePair({ fairTicks: fair, halfSpreadTicks, minTick: ctx.env.minTick, bestBidTicks: top.bidTicks || null, bestAskTicks: top.askTicks || null });
  const lots = sizeLots({ wantLots: lane.tail ? tailLots(ctx.env.quoteLots, series.minLots) : ctx.env.quoteLots, pair, cu: series.cashUnit, budget: lane.maxCashPerWindow, minLots: series.minLots });
  if (lots === 0n) return { state: "idle", placed: null, note: `fair ${fair}: no admissible size`, txs };
  const expireSec = quoteExpirySec(ctx.nowSec, m.lockAtSec, ctx.env.quoteTtlSec);
  let rested = false;
  for (const [side, ticks, kind] of [["bid", pair.bidTicks, KIND.buyYes], ["ask", pair.askTicks, KIND.buyNo]] as const) {
    if (ticks === null) continue;
    try {
      await send(`post ${side} ${lots} @ ${ticks} (fair ${fair}, exp ${expireSec})`, [placeOrderCall(ctx.venue.engine, { market: m.marketId, kind, orderType: ORDER_TYPE.postOnly, priceTicks: ticks, lots, expireTsSec: expireSec, clientId: BigInt(ctx.nowSec), useCredit: true })]);
      rested = true;
    } catch (error) {
      if (error instanceof OpsSendError && (error.errorName === "PostOnlyWouldCross" || error.errorName === "OrderAlreadyExpired")) ctx.log(`${side} ${ticks} ${label}: ${error.errorName}, skipped this pass`);
      else throw error;
    }
  }
  return { state: "quoting", placed: rested ? { fairTicks: fair, expireSec, halfSpreadTicks } : null, note: `fair ${fair} → ${pair.bidTicks ?? "-"} / ${pair.askTicks ?? "-"} × ${lots}`, txs };
}
