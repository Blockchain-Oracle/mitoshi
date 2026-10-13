// D-231: a theme is a `basket` strategy on the StrategyRegistry — its stocks and weights, the lanes it trades and the
// rule that calls each Window, as data the house runner evaluates. Pure: which stocks a basket may hold, which series it
// trades, and how big one call is. The spec's encoding, words and parser live in `spec.ts` with the other presets'.
import { STOCK_SYMBOLS, TICKERS, isStockSymbol, type StockSymbol } from "../market/tickers";
import type { LaneBasis } from "../types/market";
import type { BasketLanes, BasketMember, BasketSpec } from "./types";

export const BASKET_WEIGHT_TOTAL_BPS = 10_000;
export const BASKET_MIN_MEMBERS = 2;
export const BASKET_MAX_MEMBERS = 8;
/** No member under 5 %: a call sized by a sliver of the cap would sit under the smallest order. */
export const BASKET_MIN_WEIGHT_BPS = 500;
export const BASKET_LANES: readonly BasketLanes[] = ["regular", "stock24", "both"];
/** The stock lanes' cadences: 5, 15 and 60 minutes (the Monday Gap is no basket's). */
export const BASKET_CADENCES_SEC: readonly number[] = [300, 900, 3_600];

/** Whether a stock can be called on every lane a basket names: a RedStone source for each (SPCX has none; AMD and
 *  PLTR have no `<T>---24_7` feed, so they are regular-hours members only). */
export function basketEligible(symbol: StockSymbol, lanes: BasketLanes): boolean {
  const t = TICKERS[symbol];
  return t.redstoneFeedId !== null && (lanes === "regular" || t.redstone24x7FeedId !== null);
}

/** The stocks a basket on these lanes may hold, in the registry's order. */
export const basketStocks = (lanes: BasketLanes): StockSymbol[] => STOCK_SYMBOLS.filter((s) => basketEligible(s, lanes));

/** The engine lane bases a basket trades. */
export const basketLaneBases = (lanes: BasketLanes): readonly LaneBasis[] => (lanes === "both" ? ["regular", "stock24"] : [lanes]);

/** The cadences it calls: an agent's own (its read budget), a rule's every stock cadence. */
export const basketCadences = (spec: Pick<BasketSpec, "rule">): readonly number[] => (spec.rule.preset === "agent" ? spec.rule.cadences : BASKET_CADENCES_SEC);

/** A member's weight; 0 for a stock it doesn't hold. */
export const memberWeightBps = (spec: Pick<BasketSpec, "members">, symbol: string): number => spec.members.find((m) => m.symbol === symbol)?.weightBps ?? 0;

/** Whether one series is the basket's: a member, on one of its lanes, at one of its cadences. */
export function basketTrades(spec: BasketSpec, series: { symbol: string | null; lane: LaneBasis | null; cadenceSec: number }): boolean {
  return series.symbol !== null && series.lane !== null && memberWeightBps(spec, series.symbol) > 0 && basketLaneBases(spec.lanes).includes(series.lane) && basketCadences(spec).includes(series.cadenceSec);
}

/** One call's stake: the copier's per-trade cap times the member's weight, rounded down — a 60 % member's call takes 60 %
 *  of the cap, so the basket's own mix is what each copier's money follows. */
export function basketStakeBase(capBase: bigint, weightBps: number): bigint {
  if (capBase <= 0n || weightBps <= 0) return 0n;
  return (capBase * BigInt(Math.min(weightBps, BASKET_WEIGHT_TOTAL_BPS))) / BigInt(BASKET_WEIGHT_TOTAL_BPS);
}

/** 2–8 distinct stocks callable on these lanes, each at least 5 %, summing to exactly 100 %. */
export function isBasketMembers(members: unknown, lanes: BasketLanes): members is BasketMember[] {
  if (!Array.isArray(members) || members.length < BASKET_MIN_MEMBERS || members.length > BASKET_MAX_MEMBERS) return false;
  const seen = new Set<string>();
  let total = 0;
  for (const m of members as unknown[]) {
    if (!m || typeof m !== "object") return false;
    const { symbol, weightBps } = m as Record<string, unknown>;
    if (!isStockSymbol(symbol) || !basketEligible(symbol, lanes) || seen.has(symbol)) return false;
    if (typeof weightBps !== "number" || !Number.isInteger(weightBps) || weightBps < BASKET_MIN_WEIGHT_BPS) return false;
    seen.add(symbol);
    total += weightBps;
  }
  return total === BASKET_WEIGHT_TOTAL_BPS;
}

/** Integer weights from whole-number shares (largest remainder), summing to exactly 10,000; ties go to the earlier row. */
export function basketWeights(shares: readonly number[]): number[] {
  const total = shares.reduce((s, x) => s + Math.max(0, Math.floor(x)), 0);
  if (total <= 0) return shares.map(() => 0);
  const exact = shares.map((x) => (Math.max(0, Math.floor(x)) * BASKET_WEIGHT_TOTAL_BPS) / total);
  const out = exact.map(Math.floor);
  let left = BASKET_WEIGHT_TOTAL_BPS - out.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => ({ i, rem: x - Math.floor(x) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left === 0) break;
    out[i]! += 1;
    left -= 1;
  }
  return out;
}

/** "market-hours", "24/7", "market-hours and 24/7" — the lanes in words. */
export const basketLanesText = (lanes: BasketLanes): string => (lanes === "regular" ? "market-hours" : lanes === "stock24" ? "24/7" : "market-hours and 24/7");
