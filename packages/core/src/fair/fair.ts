/**
 * The on-chain fair-value model (A.5.4, PD-2), mirrored bit for bit from `contracts/src/fair/FairValue.sol`:
 * `P(Up) = Φ(ln(spot/open) / (σ√τ))` with Solady `lnWad` for the log and RangeMath's Φ table. Agari's float model
 * (`agari.ts`) is the reference it is measured against in `fair.vectors.json`. Integers only.
 */
import { cdfE6, isqrt, P_ONE, stdE8, Z_MAX_E4 } from "../range/math";
import { lnWad } from "./lnwad";

export const WAD = 10n ** 18n;
/** Agari `MIN_SECONDS_LEFT`. */
export const MIN_SECONDS_LEFT = 5;
const Z_DIVISOR_SCALE = 10n ** 10n;
/** Seconds in a calendar year (the 24/7 lanes' clock) and in a 252 × 6.5 h trading year (the Regular session's). */
export const CALENDAR_YEAR_SEC = 365 * 86_400;
export const TRADING_YEAR_SEC = 252 * 23_400;

export class FairValueError extends Error {}

/** Mirrors `FairValue.zE4`. */
export function fairZE4(spotE8: bigint, openE8: bigint, sigmaE8: bigint, tauSec: number): bigint {
  if (spotE8 <= 0n || openE8 <= 0n) throw new FairValueError("NonPositivePrice");
  const ratioWad = (spotE8 * WAD) / openE8;
  if (ratioWad === 0n) return -Z_MAX_E4;
  const lnW = lnWad(ratioWad);
  const std = stdE8(sigmaE8, tauSec < MIN_SECONDS_LEFT ? MIN_SECONDS_LEFT : tauSec);
  if (std === 0n) return spotE8 >= openE8 ? Z_MAX_E4 : -Z_MAX_E4;
  return (lnW * 10_000n) / (std * Z_DIVISOR_SCALE);
}

/** Mirrors `FairValue.probUpE6`: Φ(z) × 1e6. */
export function fairProbUpE6(spotE8: bigint, openE8: bigint, sigmaE8: bigint, tauSec: number): bigint {
  return cdfE6(fairZE4(spotE8, openE8, sigmaE8, tauSec));
}

/** Mirrors `FairValue.sideProbE6`. */
export function fairSideProbE6(upE6: bigint, outcomeIdx: 0 | 1): bigint {
  return outcomeIdx === 0 ? upE6 : P_ONE - upE6;
}

/** Mirrors `FairValue.yesTicks`: Agari's ⌊p·1000 + ½ + ½⌋ clamped to `[minTick, 1000 − minTick]`. */
export function fairYesTicksE6(upE6: bigint, minTick: number): number {
  const t = Number((upE6 + 1_000n) / 1_000n);
  return Math.min(1000 - minTick, Math.max(minTick, t));
}

/**
 * An annualized σ in basis points as the guard's `sigmaE8OfSeries` (σ per √second × 1e8) for a clock of `yearSec`
 * seconds: `⌊√(bps² · 1e8 / yearSec)⌋`. The owner sets this per Series (calendar year for 24/7 lanes).
 */
export function sigmaE8FromBps(sigmaBps: number, yearSec: number): bigint {
  const b = BigInt(sigmaBps);
  return isqrt((b * b * 100_000_000n) / BigInt(yearSec));
}
