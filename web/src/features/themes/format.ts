// `/themes*`'s number words (R4-11, D-227): basis points as percents, StockReference prices (1e18) as dollars, the
// cadence and sessions from the theme's own fields. Display only.
import { formatBaseUnits } from "@cwf/core";
import { THEMES } from "./copy";

export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
export const usd18 = (e18: bigint) => `$${formatBaseUnits(e18, 18, { minDp: 2, maxDp: 2 })}`;
export const usd6 = (base: bigint) => `$${formatBaseUnits(base, 6, { minDp: 2, maxDp: 2 })}`;

export function everyText(sec: number): string {
  if (sec % 86_400 === 0) return sec === 86_400 ? "daily" : `every ${sec / 86_400} days`;
  if (sec % 3_600 === 0) return sec === 3_600 ? "hourly" : `every ${sec / 3_600} h`;
  return `every ${Math.round(sec / 60)} min`;
}

export function sessionsText(mask: number): string {
  const on = THEMES.sessions.filter((_, i) => (mask >> i) & 1);
  return on.length ? on.join(", ") : "—";
}

/** Σ target × price over the members that have a price, divided by their weight: a target-weighted price. */
export function weightedPrice(members: readonly { band: { targetBps: number }; refPriceE18: bigint | null }[]): { e18: bigint | null; priced: number } {
  const priced = members.filter((m) => m.refPriceE18 !== null);
  const w = priced.reduce((s, m) => s + BigInt(m.band.targetBps), 0n);
  if (w === 0n) return { e18: null, priced: 0 };
  return { e18: priced.reduce((s, m) => s + m.refPriceE18! * BigInt(m.band.targetBps), 0n) / w, priced: priced.length };
}

/** A member colour by index, on tokens (the kit's chart palette). */
export const sliceColor = (i: number) => [`var(--color-accent)`, `var(--color-up)`, `var(--color-warning)`, `var(--color-down)`, `var(--color-ink-secondary)`][i % 5]!;
