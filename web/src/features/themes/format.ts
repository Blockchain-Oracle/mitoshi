// `/themes*`'s number words (R6, D-230; D-231): basis points as percents, base units as dollars, a basket's rule and
// lanes, dates in New York time (the server and the browser render the same words, so a hydrated page never disagrees
// with its HTML). Display only.
import { formatBaseUnits, formatCadence, isTickerSymbol, TICKERS, type BasketRule, type BasketSpec } from "@cwf/core";
import { THEMES } from "./copy";

export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
/** "+12.4%", "−3.1%", "0.0%" (a true minus sign). */
export const signedPct = (bps: number) => `${bps > 0 ? "+" : bps < 0 ? "−" : ""}${(Math.abs(bps) / 100).toFixed(1)}%`;
export const toneOf = (bps: number | null) => (bps === null || bps === 0 ? undefined : bps > 0 ? "up" : "down");
export const usd6 = (base: bigint | string) => `$${formatBaseUnits(BigInt(base), 6, { minDp: 2, maxDp: 2 })}`;
/** A float price from ops' display candles ("$374.52"): drawn, never settled on. */
export const usdFloat = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The trigger in a rule's own words: 10 bps → "0.1%". */
const triggerPct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** "Momentum · 0.1% trigger", "Agent · 1h reads". */
export function ruleText(rule: BasketRule): string {
  if (rule.preset === "agent") return THEMES.rule.agent(rule.cadences.map(formatCadence).join("/"));
  return rule.preset === "momentum" ? THEMES.rule.momentum(triggerPct(rule.thresholdBps)) : THEMES.rule.reversion(triggerPct(rule.thresholdBps));
}

export const lanesText = (spec: Pick<BasketSpec, "lanes">) => THEMES.lanes[spec.lanes];

/** The company's name for a listed ticker; the symbol itself otherwise. */
export const companyOf = (symbol: string) => (isTickerSymbol(symbol) ? TICKERS[symbol].name : symbol);

/** A member's colour by index: the vermilion family, then two hues (`--th-slice-*` in themes.css). */
export const sliceColor = (i: number) => `var(--th-slice-${i % 6})`;

const ET = "America/New_York";
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: ET, month: "short", day: "numeric" });
const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: ET, month: "short", year: "2-digit" });
const stampFmt = new Intl.DateTimeFormat("en-US", { timeZone: ET, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "Oct 13" — the chart's axis on a week, a month or three. */
export const etDay = (ms: number) => dayFmt.format(ms);
/** "Oct 26" — a year's axis (month and year). */
export const etMonth = (ms: number) => monthFmt.format(ms);
/** "Oct 13, 14:05 ET". */
export const etStamp = (ms: number) => `${stampFmt.format(ms)} ET`;
/** "14:05" — a call's time on a day the list already names. */
export const etTime = (ms: number) => timeFmt.format(ms);

/** "2h 10m", "1d 3h", "8m" — how long until a time, for "trades in …". */
export function untilText(atSec: number, nowSec: number): string {
  const s = Math.max(0, atSec - nowSec);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.max(1, Math.ceil((s % 3_600) / 60));
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m === 60 ? 59 : m}m` : `${m}m`;
}
