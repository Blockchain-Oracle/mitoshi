// Ported from Masayume 68f7a09:web/src/features/parlay/format.ts — integer formatting only (no float money): the
// multiplier headline, probabilities, dollars. Lines use the markets' one e-8 price scale (`features/markets/units`).
import { formatBaseUnits } from "@cwf/core/units";
import { USD_DECIMALS } from "@cwf/core";

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** The ticket headline: `multiplier.toFixed(multiplier >= 10 ? 0 : 1)` in the reference, without a float. */
export function formatMultiplier(milli: number): string {
  if (milli >= 10_000) return `${Math.round(milli / 1000)}×`;
  const tenths = Math.round(milli / 100);
  return `${Math.floor(tenths / 10)}.${tenths % 10}×`;
}

/** A probability per whole unit as `12.34%` — the reference's `(p * 100).toFixed(2)`. */
export function formatProbPct(probRaw: bigint, one: bigint): string {
  const hundredths = Number((probRaw * 10_000n) / one);
  return `${Math.floor(hundredths / 100)}.${pad2(hundredths % 100)}%`;
}

/** A per-leg price (collateral per whole contract) as cents, e.g. `52¢`. */
export function formatCents(priceRaw: bigint): string {
  return `${formatBaseUnits(priceRaw * 100n, USD_DECIMALS, { minDp: 0, maxDp: 1 })}¢`;
}

/** A fair probability × 1e6 as cents. */
export function formatCentsE6(e6: bigint): string {
  return formatCents(e6);
}

export function usd(base: bigint): string {
  return `$${formatBaseUnits(base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;
}

/** Whole contracts for a refusal line (`20 of 100`). */
export function contracts(raw: bigint): string {
  return formatBaseUnits(raw, USD_DECIMALS, { minDp: 0, maxDp: 2 });
}

export function utilizationPct(bps: number): string {
  return String(Math.round(bps / 100));
}
