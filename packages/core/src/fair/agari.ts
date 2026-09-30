// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/market-maker/seat/fair.ts —
// the float model the house maker quotes around, unchanged; its `p` is factored out as `fairProbUp` so the vectors can
// record it. The reference `fair.vectors.json` measures the on-chain integer model (`fair.ts` / `FairValue.sol`) against.

/** Regular-session seconds in a trading year (252 × 6.5 h): intraday variance accrues only while the market trades. */
export const TRADING_YEAR_SEC = 252 * 23_400;
/** Floor on time left, so the last seconds before the close print don't divide the scale to zero. */
export const MIN_SECONDS_LEFT = 5;
/** Ties settle Up (PD-3): half a tick of upward bias, so an unmoved price quotes 501, not 500. */
export const TIE_BIAS_TICKS = 0.5;

/** Φ(z) via Abramowitz–Stegun 7.1.26 (|error| < 1.5·10⁻⁷). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

export interface FairInput {
  /** Latest spot, price × 10⁸. */
  spotE8: bigint;
  /** The Window's recorded open print, price × 10⁸. */
  openE8: bigint;
  /** `expiry − now`, chain seconds. */
  secondsLeft: number;
  /** Annualized σ in basis points. */
  sigmaBps: number;
  /** Quotes never go below this many ticks or above `1000 − minTick`. */
  minTick: number;
}

const RATIO_SCALE = 1_000_000_000n;

/** The float P(Up) the tick function rounds (Agari's `p`, exposed for the vectors). */
export function fairProbUp(i: Omit<FairInput, "minTick">): number {
  if (i.spotE8 <= 0n || i.openE8 <= 0n) throw new Error("fair value needs positive spot and open prices");
  const ratio = Number((i.spotE8 * RATIO_SCALE) / i.openE8) / Number(RATIO_SCALE);
  const scale = (i.sigmaBps / 10_000) * Math.sqrt(Math.max(i.secondsLeft, MIN_SECONDS_LEFT) / TRADING_YEAR_SEC);
  return scale > 0 ? normalCdf(Math.log(ratio) / scale) : ratio >= 1 ? 1 : 0;
}

/** `P(close ≥ open) = Φ(ln(spot/open) / (σ·√(t/year)))`, as YES ticks clamped to `[minTick, 1000 − minTick]`. */
export function fairYesTicks(i: FairInput): number {
  const p = fairProbUp(i);
  const ticks = Math.floor(p * 1000 + TIE_BIAS_TICKS + 0.5);
  return Math.min(1000 - i.minTick, Math.max(i.minTick, ticks));
}
