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

type Call = Parameters<typeof sendOps>[1][number];
export type Step = { what: string; call: Call };

/**
 * One Window's pass, read and decided but not sent (D-230): either its result outright, or the calls to send — in one
 * transaction, in order — with the result once they land (`done`), and what to do if the chain refuses them together
 * (`fallback`: one call at a time against the book as it stands after the cancel). The pass packs several Windows'
 * steps into one transaction (`runtime/pack.ts`); `tendWindow` sends one Window's alone.
 */
export type WindowPlan =
  | { result: WindowResult }
  | { steps: Step[]; why: string; done: (hash: string) => WindowResult; fallback: (() => Promise<WindowResult>) | null };

export async function planWindow(ctx: WindowCtx, series: SeriesView, m: MarketView, lane: LaneQuote, placed: Placed | null, label: string): Promise<WindowPlan> {
  const me = ctx.client.address as Address;
  const trading = m.state === 0 && m.tradingStartSec <= ctx.nowSec && ctx.nowSec < m.lockAtSec;
  const none = (state: WindowResult["state"], note: string, keep: Placed | null = null): WindowPlan => ({ result: { state, placed: keep, note, txs: [] } });
  if (!trading) return none("idle", "not trading");
  const fair = lane.phase === "quote" ? lane.fairTicks : null;
  const halfSpreadTicks = lane.halfSpreadTicks ?? ctx.env.halfSpreadTicks;
  if (fair !== null && placed && !needsRequote({ placed, fairTicks: fair, nowSec: ctx.nowSec, requoteTicks: ctx.env.requoteTicks, halfSpreadTicks, lockAtSec: m.lockAtSec })) return none("resting", `fair ${fair}, resting`, placed);
  if (!placed && lane.phase !== "quote") return none(lane.phase === "stop" ? "stopped" : "pulled", lane.why);
  if (!placed && fair === null) return none("idle", lane.why);
  const clock = ctx.clockSec ?? (() => ctx.nowSec);
  const [orders, [pos]] = await Promise.all([openOrdersOf(ctx.client, ctx.venue, m.marketId, me), positionsOf(ctx.client, ctx.venue, m.marketId, [me])]);
  const cancelStep = orders.length ? [{ what: `cancelAll (${orders.length})`, call: cancelAllCall(ctx.venue.engine, m.marketId, 32, false) }] : [];
  const after = (state: WindowResult["state"], note: string): WindowPlan =>
    cancelStep.length ? { steps: cancelStep, why: `${cancelStep[0]!.what} ${note}`, done: (hash) => ({ state, placed: null, note, txs: [hash] }), fallback: null } : none(state, note);
  if (lane.phase !== "quote") {
    // A stop near lock leaves what rests to expire at lock − 30 (no cancel fee); a pull cancels at once.
    return lane.phase === "pull" ? after("pulled", lane.why) : none("stopped", lane.why);
  }
  if (fair === null) return after("idle", lane.why);
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
  const result = (plan: ReturnType<typeof planOn>, rested: boolean, txs: string[]): WindowResult =>
    plan.lots === 0n
      ? { state: "idle", placed: null, note: `fair ${fair}: no admissible size`, txs }
      : { state: "quoting", placed: rested ? { fairTicks: fair, expireSec: plan.expireSec, halfSpreadTicks: placeHalf } : null, note: `fair ${fair} → ${plan.pair.bidTicks ?? "-"} / ${plan.pair.askTicks ?? "-"} × ${plan.lots}`, txs };
  // One transaction per requote (S24.4): cancel what rests, merge, place the new pair — atomic, so the book never shows
  // a missing side between the cancel and the placements (a CLOSE then found no exit), and a pass sends a third of the
  // transactions. The pair is priced against everyone's best but ours, which goes in the same transaction.
  const own = orders.map((o) => ({ isBid: o.kind === KIND.buyYes, ticks: o.priceTicks, lots: o.lots }));
  const plan = planOn(othersTop(await topOfBook(ctx.client, ctx.venue, m.marketId), own));
  const steps: Step[] = [
    ...cancelStep,
    ...(mergeLots > 0n ? [{ what: `mergeSet ${mergeLots}`, call: mergeSetCall(ctx.venue.engine, m.marketId, mergeLots, false) }] : []),
    ...plan.posts.map((p) => ({ what: `post ${p.side} ${plan.lots} @ ${p.ticks}`, call: p.call })),
  ];
  if (!steps.length) return { result: result(plan, false, []) };
  const why = placed ? `requote ${placed.fairTicks} → ${fair}` : "fresh quote";
  // The pack would revert (a side crosses an order behind ours, or the clock ran out): one call at a time, each
  // simulated, against the book as it stands after the cancel.
  const fallback = plan.posts.length
    ? async (): Promise<WindowResult> => {
        const txs: string[] = [];
        const send = async (call: Call) => void txs.push((await sendOps(ctx.client, [call], ctx.clockSec ? { nowSec: ctx.clockSec() } : {})).hash);
        for (const x of steps.slice(0, steps.length - plan.posts.length)) await send(x.call);
        const top = await topOfBook(ctx.client, ctx.venue, m.marketId);
        const again = planOn({ bidTicks: top.bidTicks || null, askTicks: top.askTicks || null });
        let rested = false;
        for (const p of again.posts) {
          try {
            await send(p.call);
            rested = true;
          } catch (error) {
            if (error instanceof OpsSendError && (error.errorName === "PostOnlyWouldCross" || error.errorName === "OrderAlreadyExpired")) ctx.log(`${p.side} ${p.ticks} ${label}: ${error.errorName}, skipped this pass`);
            else throw error;
          }
        }
        return result(again, rested, txs);
      }
    : null;
  return { steps, why: `${why}: ${steps.map((x) => x.what).join("; ")} (fair ${fair}, exp ${plan.expireSec})`, done: (hash) => result(plan, plan.posts.length > 0, [hash]), fallback };
}

/** One Window's pass, sent on its own: its steps in one transaction, falling back to one call at a time on a refusal. */
export async function tendWindow(ctx: WindowCtx, series: SeriesView, m: MarketView, lane: LaneQuote, placed: Placed | null, label: string): Promise<WindowResult> {
  const plan = await planWindow(ctx, series, m, lane, placed, label);
  if ("result" in plan) return plan.result;
  if (ctx.dryRun) {
    ctx.log(`DRY ${plan.why} ${label}`);
    return plan.done("dry");
  }
  try {
    const sent = await sendOps(ctx.client, plan.steps.map((x) => x.call), ctx.clockSec ? { nowSec: ctx.clockSec() } : {});
    return plan.done(sent.hash);
  } catch (error) {
    if (!(error instanceof OpsSendError) || !plan.fallback) throw error;
    ctx.log(`${label}: one-transaction requote refused (${error.errorName ?? error.message}), one call at a time`);
    return plan.fallback();
  }
}
