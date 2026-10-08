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
import { MIN_ORDER_LIFE_SEC, needsRequote, othersTop, quoteExpirySec, quotePair, sizeLots, tailHalfSpread, tailLots, type Placed } from "./quote";

export interface WindowCtx {
  client: OpsClient;
  venue: Venue;
  env: SeedMakerEnv;
  dryRun: boolean;
  nowSec: number;
  /** The chain clock now (a pass runs for tens of seconds: each placement checks it, and each send is stamped by it). */
  clockSec?: () => number;
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
  const clock = ctx.clockSec ?? (() => ctx.nowSec);
  const send = async (what: string, calls: Parameters<typeof sendOps>[1]) => {
    if (ctx.dryRun) return void ctx.log(`DRY ${what} ${label}`);
    const sent = await sendOps(ctx.client, calls, ctx.clockSec ? { nowSec: ctx.clockSec() } : {});
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
  const mergeLots = pos && pos.yesFree > 0n && pos.noFree > 0n ? (pos.yesFree < pos.noFree ? pos.yesFree : pos.noFree) : 0n;
  // The exit tail widens and shrinks only what it places: a pair already resting stays (requoting every Window that
  // locks on the hour at the same second was a storm of sends, S24.4). The placed spread is what `needsRequote` compares.
  const placeHalf = lane.tail ? tailHalfSpread(halfSpreadTicks) : halfSpreadTicks;
  const wantLots = lane.tail ? tailLots(ctx.env.quoteLots, series.minLots) : ctx.env.quoteLots;
  const planOn = (top: { bidTicks: number | null; askTicks: number | null }) => {
    const pair = quotePair({ fairTicks: fair, halfSpreadTicks: placeHalf, minTick: ctx.env.minTick, bestBidTicks: top.bidTicks, bestAskTicks: top.askTicks });
    const lots = sizeLots({ wantLots, pair, cu: series.cashUnit, budget: lane.maxCashPerWindow, minLots: series.minLots });
    const expireSec = quoteExpirySec(clock(), m.lockAtSec, ctx.env.quoteTtlSec);
    // Too late to rest: the engine would refuse it (`OrderAlreadyExpired`) after the fee, or it would live seconds.
    const late = expireSec - clock() < MIN_ORDER_LIFE_SEC;
    if (late && lots > 0n) ctx.log(`${label}: under ${MIN_ORDER_LIFE_SEC} s to expiry, nothing placed`);
    const sides = [["bid", pair.bidTicks, KIND.buyYes], ["ask", pair.askTicks, KIND.buyNo]] as const;
    const posts = lots === 0n || late ? [] : sides.flatMap(([side, ticks, kind]) => (ticks === null ? [] : [{ side, ticks, call: placeOrderCall(ctx.venue.engine, { market: m.marketId, kind, orderType: ORDER_TYPE.postOnly, priceTicks: ticks, lots, expireTsSec: expireSec, clientId: BigInt(ctx.nowSec), useCredit: true }) }]));
    return { pair, lots, expireSec, posts };
  };
  const result = (plan: ReturnType<typeof planOn>, rested: boolean): WindowResult =>
    plan.lots === 0n
      ? { state: "idle", placed: null, note: `fair ${fair}: no admissible size`, txs }
      : { state: "quoting", placed: rested ? { fairTicks: fair, expireSec: plan.expireSec, halfSpreadTicks: placeHalf } : null, note: `fair ${fair} → ${plan.pair.bidTicks ?? "-"} / ${plan.pair.askTicks ?? "-"} × ${plan.lots}`, txs };
  // One transaction per requote (S24.4): cancel what rests, merge, place the new pair — atomic, so the book never shows
  // a missing side between the cancel and the placements (a CLOSE then found no exit), and a pass sends a third of the
  // transactions. The pair is priced against everyone's best but ours, which goes in the same transaction.
  const own = orders.map((o) => ({ isBid: o.kind === KIND.buyYes, ticks: o.priceTicks, lots: o.lots }));
  const plan = planOn(othersTop(await topOfBook(ctx.client, ctx.venue, m.marketId), own));
  const steps = [
    ...(orders.length ? [{ what: `cancelAll (${orders.length})`, call: cancelAllCall(ctx.venue.engine, m.marketId, 32, false) }] : []),
    ...(mergeLots > 0n ? [{ what: `mergeSet ${mergeLots}`, call: mergeSetCall(ctx.venue.engine, m.marketId, mergeLots, false) }] : []),
    ...plan.posts.map((p) => ({ what: `post ${p.side} ${plan.lots} @ ${p.ticks}`, call: p.call })),
  ];
  if (!steps.length) return result(plan, false);
  const why = placed ? `requote ${placed.fairTicks} → ${fair}` : "fresh quote";
  try {
    await send(`${why}: ${steps.map((x) => x.what).join("; ")} (fair ${fair}, exp ${plan.expireSec})`, steps.map((x) => x.call));
    return result(plan, plan.posts.length > 0);
  } catch (error) {
    if (!(error instanceof OpsSendError) || !plan.posts.length) throw error;
    // The batch would revert — gas estimation refuses it before any fee (a side crosses an order behind ours, or the
    // clock ran out): one call at a time, each simulated, against the book as it stands after the cancel.
    ctx.log(`${label}: one-transaction requote refused (${error.errorName ?? error.message}), one call at a time`);
  }
  for (const x of steps.slice(0, steps.length - plan.posts.length)) await send(`${x.what} ${why}`, [x.call]);
  const top = await topOfBook(ctx.client, ctx.venue, m.marketId);
  const again = planOn({ bidTicks: top.bidTicks || null, askTicks: top.askTicks || null });
  let rested = false;
  for (const p of again.posts) {
    try {
      await send(`post ${p.side} ${again.lots} @ ${p.ticks} (fair ${fair}, exp ${again.expireSec})`, [p.call]);
      rested = true;
    } catch (error) {
      if (error instanceof OpsSendError && (error.errorName === "PostOnlyWouldCross" || error.errorName === "OrderAlreadyExpired")) ctx.log(`${p.side} ${p.ticks} ${label}: ${error.errorName}, skipped this pass`);
      else throw error;
    }
  }
  return result(again, rested);
}
