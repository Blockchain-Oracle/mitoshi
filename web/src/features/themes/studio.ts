// The themes studio's draft and every reason a step can't advance (D-231), checked in one pure place; the result is one
// `strategy-publish` of a `basket` spec, run by the house runner (self-paid: the metadata is an SSTORE2 write, D-019).
import {
  AGENT_PERSONA_MAX_CHARS, BASKET_MAX_MEMBERS, BASKET_MIN_MEMBERS, BASKET_MIN_WEIGHT_BPS, BASKET_WEIGHT_TOTAL_BPS, basketEligible, basketWeights, isSpec, parseDecimalToBaseUnits,
  USD_DECIMALS, type AgentPosture, type BasketLanes, type BasketSpec, type StockSymbol, type StrategyEnvelope, type StrategyMetadata,
} from "@cwf/core";
import { THEMES } from "./copy";
import { pct } from "./format";

const S = THEMES.studio;
export type StudioRule = "momentum" | "reversion" | "agent";
export const NAME_MAX = 40;
export const BLURB_MAX = 140;
/** The dearest side a theme's call may buy: 85¢, the strategies studio's Balanced. */
const PRICE_CAP_RAW = 850_000n;
const MAX_FEE_BASE = 100_000_000n;

export interface StudioDraft {
  lanes: BasketLanes;
  /** The picked stocks in the order picked, each with its weight in bps. */
  members: { symbol: StockSymbol; weightBps: number }[];
  rule: StudioRule;
  thresholdBps: number;
  persona: string;
  posture: AgentPosture;
  cadences: number[];
  name: string;
  blurb: string;
  perTradeText: string;
  dailyText: string;
  feeText: string;
}

export const EMPTY_STUDIO: StudioDraft = {
  lanes: "regular", members: [], rule: "momentum", thresholdBps: 10, persona: "", posture: "balanced", cadences: [3_600], name: "", blurb: "", perTradeText: "5", dailyText: "50", feeText: "0",
};

/** A stock the studio can offer on these lanes: a signed source for each lane, and its Windows listing now. */
export function offerable(s: { symbol: StockSymbol; regular: boolean; allHours: boolean }, lanes: BasketLanes): boolean {
  return basketEligible(s.symbol, lanes) && (lanes === "regular" ? s.regular : lanes === "stock24" ? s.allHours : s.regular && s.allHours);
}

/** Pick or drop a stock; every pick re-splits the weights equally (the creator tunes them after). */
export function toggleMember(d: StudioDraft, symbol: StockSymbol): StudioDraft["members"] {
  const has = d.members.some((m) => m.symbol === symbol);
  if (!has && d.members.length >= BASKET_MAX_MEMBERS) return d.members;
  const symbols = has ? d.members.filter((m) => m.symbol !== symbol).map((m) => m.symbol) : [...d.members.map((m) => m.symbol), symbol];
  return equalWeights(symbols);
}

export function equalWeights(symbols: readonly StockSymbol[]): StudioDraft["members"] {
  const w = basketWeights(symbols.map(() => 1));
  return symbols.map((symbol, i) => ({ symbol, weightBps: w[i]! }));
}

export const weightTotal = (d: Pick<StudioDraft, "members">) => d.members.reduce((s, m) => s + m.weightBps, 0);

export interface StudioCheck {
  stocks: string | null;
  rule: string | null;
  publish: string | null;
  spec: BasketSpec | null;
  envelope: StrategyEnvelope | null;
  feeBase: bigint;
  metadata: StrategyMetadata | null;
}

const usd = (text: string) => parseDecimalToBaseUnits(text.trim() === "" ? "0" : text, USD_DECIMALS);

export function checkStudio(d: StudioDraft, ctx: { houseRunner: string | null }): StudioCheck {
  const total = weightTotal(d);
  const stocks =
    d.members.length < BASKET_MIN_MEMBERS ? S.pick
    : d.members.some((m) => !basketEligible(m.symbol, d.lanes)) ? S.noLane(d.members.find((m) => !basketEligible(m.symbol, d.lanes))!.symbol)
    : d.members.some((m) => m.weightBps < BASKET_MIN_WEIGHT_BPS) ? S.under(pct(BASKET_MIN_WEIGHT_BPS))
    : total !== BASKET_WEIGHT_TOTAL_BPS ? S.over(pct(total))
    : null;
  const rule =
    d.rule === "agent"
      ? d.persona.trim().length === 0 || d.persona.length > AGENT_PERSONA_MAX_CHARS ? S.needPersona : d.cadences.length === 0 ? S.needCadence : null
      : null;
  const spec: BasketSpec = {
    preset: "basket",
    members: d.members.map((m) => ({ symbol: m.symbol, weightBps: m.weightBps })),
    rule: d.rule === "agent" ? { preset: "agent", persona: d.persona.trim(), posture: d.posture, cadences: [...d.cadences].sort((a, b) => a - b) } : { preset: d.rule, lookback: 6, thresholdBps: d.thresholdBps },
    lanes: d.lanes,
  };
  const perTrade = usd(d.perTradeText);
  const daily = usd(d.dailyText);
  const fee = usd(d.feeText);
  const limits = perTrade === null || daily === null || perTrade <= 0n || daily <= 0n || perTrade > daily || fee === null || fee > MAX_FEE_BASE ? S.limitsBad : null;
  const publish = !d.name.trim() || d.name.length > NAME_MAX ? S.needName : limits ?? (ctx.houseRunner ? null : S.noRunner);
  const valid = stocks === null && rule === null && isSpec(spec);
  const open = Math.min(10, d.members.length * (d.lanes === "both" ? 2 : 1));
  return {
    stocks, rule, publish,
    spec: valid ? spec : null,
    envelope: limits || perTrade === null || daily === null ? null : { maxStakePerTradeBase: perTrade, maxDailySpendBase: daily, maxOpenPositions: Math.max(1, open), maxPriceRaw: PRICE_CAP_RAW, series: null },
    feeBase: fee ?? 0n,
    metadata: valid ? { name: d.name.trim(), description: d.blurb.trim().slice(0, BLURB_MAX), spec } : null,
  };
}
