// Ported from Masayume 68f7a09:web/src/features/range/presets.ts — unchanged (the reference's band presets and scaling).
/**
 * The reference's band presets (`lib/sui/ticket624.core.ts` L222–230) and its per-cadence scaling
 * (`Ticket624Drawer.tsx` L64–66: a ±$30 band is trivial on a 1-minute market but a real call on 1h).
 * The reference knew one asset and three cadences. The venue lists more of both, so:
 * - other lanes scale by √time from the 5-minute anchor, which the reference's own three factors roughly follow;
 * - other assets scale by price. The reference's dollars are BTC's, tuned near $77k; on ETH at $2.4k the same
 *   dollars are thirty times wider in relative terms and every band priced as a near-certainty (found in a
 *   browser 2026-09-03, context/49). So the presets are carried to an asset by its price ratio to that anchor,
 *   and the five-dollar centre grid becomes the nearest "nice" step at that scale — BTC keeps the reference's
 *   exact numbers, ETH gets ±$0.40 / $1.00 / $1.80 on the 5-minute lane and a $0.20 grid.
 */
export const RANGE_PRESETS = [
  { key: "tight", label: "Tight", half: 15 },
  { key: "medium", label: "Medium", half: 30 },
  { key: "wide", label: "Wide", half: 55 },
] as const;
export type RangePresetKey = (typeof RANGE_PRESETS)[number]["key"];

/** How far the band centre may drift from spot, in the reference's dollars, before scaling. */
export const RANGE_CENTER_MAX = 35;
/** The reference's centre step: five dollars, on BTC. */
export const RANGE_STEP_USD = 5;
/** The price level the reference's dollar presets sit at (BTC while it was written). */
export const PRESET_ANCHOR_USD = 77_000;
const ANCHOR_SEC = 300;
const MAX_FACTOR = 16;
/** The grid a centre may snap to, in dollars; the reference's $5 is one of them. */
const NICE_UNITS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500] as const;

export function cadenceBandFactor(intervalSec: number): number {
  if (intervalSec <= 60) return 0.5;
  if (intervalSec <= ANCHOR_SEC) return 1;
  if (intervalSec === 3600) return 4;
  return Math.min(MAX_FACTOR, Math.round(Math.sqrt(intervalSec / ANCHOR_SEC) * 10) / 10);
}

/** The asset's price over the anchor's; 1 until the price is known, so the reference's numbers show meanwhile. */
export function assetScale(spotUsd: number | null): number {
  return spotUsd !== null && spotUsd > 0 ? spotUsd / PRESET_ANCHOR_USD : 1;
}

/** The centre grid for this asset: the reference's $5 scaled by price, then the nearest nice step (log distance). */
export function bandUnitUsd(spotUsd: number | null): number {
  const raw = RANGE_STEP_USD * assetScale(spotUsd);
  let best: number = NICE_UNITS[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const unit of NICE_UNITS) {
    const distance = Math.abs(Math.log(raw / unit));
    if (distance < bestDistance) {
      best = unit;
      bestDistance = distance;
    }
  }
  return best;
}

/** Decimals a dollar figure on this grid needs — none on BTC's $5, cents on ETH's $0.20. */
export function unitDecimals(unit: number): number {
  return unit >= 1 ? 0 : 2;
}

function roundToUnit(value: number, unit: number, minUnits: number): number {
  const units = Math.max(minUnits, Math.round(value / unit));
  return Number((units * unit).toFixed(unitDecimals(unit)));
}

/** The preset's half-width in dollars for this cadence and asset, on the grid, never under one step. */
export function bandHalfUsd(preset: RangePresetKey, intervalSec: number, spotUsd: number | null): number {
  const half = RANGE_PRESETS.find((p) => p.key === preset)?.half ?? 30;
  return roundToUnit(half * cadenceBandFactor(intervalSec) * assetScale(spotUsd), bandUnitUsd(spotUsd), 1);
}

export function centerMaxUsd(intervalSec: number, spotUsd: number | null): number {
  return roundToUnit(RANGE_CENTER_MAX * cadenceBandFactor(intervalSec) * assetScale(spotUsd), bandUnitUsd(spotUsd), 2);
}

/** The reference's track shows ±max(90, half + 35) dollars around spot; the same, in the asset's grid. */
export function trackHalfUsd(half: number, centerMax: number, unit: number): number {
  return Math.max(18 * unit, half + centerMax);
}

export function snapOffset(value: number, max: number, unit: number): number {
  const magnitude = Math.min(max, roundToUnit(Math.abs(value), unit, 0));
  return Number(((value < 0 ? -1 : 1) * magnitude).toFixed(unitDecimals(unit)));
}
