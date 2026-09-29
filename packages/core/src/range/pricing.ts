// Ported from Masayume 68f7a09:packages/core/src/range/pricing.ts
import { BPS_DENOMINATOR } from "../constants/sizing";
import { ceilDiv } from "../units/money";
import { CDF_TABLE_E6 } from "./cdf-table";
import type { RangeMode, RangeParams, RangeQuote, RangeRefusal, RangeSide } from "./types";

const BPS = BigInt(BPS_DENOMINATOR);
/** The probability scale of the table and of every figure inside the maths. */
export const P_ONE = 1_000_000n;
const E8 = 100_000_000n;
const Z_STEP_E4 = 500n;
const Z_MAX_E4 = 40_000n;
const TABLE_LAST = 80;

function tableAt(i: number): bigint {
  const value = CDF_TABLE_E6[i];
  if (value === undefined) throw new Error(`cdf table has no entry ${i}`);
  return BigInt(value);
}

/** Mirrors `RangeMath.cdfE6`: Φ(z) × 1e6, linear between table points, saturating past |z| = 4. */
export function cdfE6(zE4: bigint): bigint {
  if (zE4 < 0n) return P_ONE - cdfE6(-zE4);
  if (zE4 >= Z_MAX_E4) return P_ONE;
  const i = Number(zE4 / Z_STEP_E4);
  const frac = zE4 % Z_STEP_E4;
  const lo = tableAt(i);
  const hi = tableAt(i + 1);
  return lo + ((hi - lo) * frac) / Z_STEP_E4;
}

/** Mirrors `RangeMath.probitE4`: Φ⁻¹(p) × 1e4 for p × 1e6, clamped to ±4. */
export function probitE4(pE6: bigint): bigint {
  if (pE6 < P_ONE / 2n) return -probitE4(P_ONE - pE6);
  if (pE6 >= tableAt(TABLE_LAST)) return Z_MAX_E4;
  let i = 0;
  while (tableAt(i + 1) <= pE6) i++;
  const lo = tableAt(i);
  const hi = tableAt(i + 1);
  return BigInt(i) * Z_STEP_E4 + ((pE6 - lo) * Z_STEP_E4) / (hi - lo);
}

/** Mirrors `RangeMath.isqrt`: ⌊√x⌋. */
export function isqrt(x: bigint): bigint {
  if (x === 0n) return 0n;
  let z = (x + 1n) / 2n;
  let y = x;
  while (z < y) {
    y = z;
    z = (x / z + z) / 2n;
  }
  return y;
}

/** Mirrors `RangeMath.stdE8`: σ√τ × 1e8 with two extra digits under the root. */
export function stdE8(sigmaE8: bigint, tauSec: number): bigint {
  return (sigmaE8 * isqrt(BigInt(tauSec) * 10_000n)) / 100n;
}

/** Mirrors `RangeMath.zOf`: a print's distance from the opening print in standard deviations, × 1e4. BigInt division truncates as the EVM's does. */
export function zOf(print: bigint, openingPrint: bigint, std: bigint): bigint {
  const relE8 = ((print - openingPrint) * E8) / openingPrint;
  return (relE8 * 10_000n) / std;
}

/** Mirrors `RangeMath.bandProbE6`: P(low ≤ close ≤ high) × 1e6 with the market sitting at `centerQE6`. */
export function bandProbE6(openingPrint: bigint, lowPrint: bigint, highPrint: bigint, centerQE6: bigint, sigmaE8: bigint, tauSec: number): bigint {
  const std = stdE8(sigmaE8, tauSec);
  const mu = probitE4(centerQE6);
  const upper = cdfE6(zOf(highPrint, openingPrint, std) - mu);
  const lower = cdfE6(zOf(lowPrint, openingPrint, std) - mu);
  return upper > lower ? upper - lower : 0n;
}

/** The chosen side's fair probability per whole unit of collateral, as `RangePricing._price` scales it. */
export function sideProbRaw(insideProbE6: bigint, side: RangeSide, one: bigint): bigint {
  const pE6 = side === "inside" ? insideProbE6 : P_ONE - insideProbE6;
  return (pE6 * one) / P_ONE;
}

/** Mirrors `RangeMath.floorStake`: fair value plus the margin, both rounded up in the reserve's favour. */
export function floorStake(maxPayoutBase: bigint, probRaw: bigint, one: bigint, marginBps: number): bigint {
  const fair = ceilDiv(maxPayoutBase * probRaw, one);
  return ceilDiv(fair * (BPS + BigInt(marginBps)), BPS);
}

/** The largest payout whose floored stake fits inside `stakeBase` — the "Set stake" solve; 0 when none does. */
export function maxPayoutForStake(stakeBase: bigint, probRaw: bigint, one: bigint, marginBps: number): bigint {
  if (probRaw === 0n) return 0n;
  let payout = (stakeBase * BPS * one) / (probRaw * (BPS + BigInt(marginBps)));
  while (payout > 0n && floorStake(payout, probRaw, one, marginBps) > stakeBase) payout -= 1n;
  return payout;
}

export function multiplierMilli(maxPayoutBase: bigint, stakeBase: bigint): number {
  return stakeBase > 0n ? Number((maxPayoutBase * 1000n) / stakeBase) : 0;
}

export interface RangeQuoteInput {
  openingPrint: bigint;
  lowPrint: bigint;
  highPrint: bigint;
  side: RangeSide;
  /** The basis as `previewBasis` returns it. */
  centerQE6: bigint;
  sigmaE8: bigint;
  tauSec: number;
  mode: RangeMode;
  params: Pick<RangeParams, "marginBps" | "minProbRaw" | "maxProbRaw" | "maxPayoutCapBase">;
  one: bigint;
  decimals: number;
  nowMs: number;
}

export type RangeQuoteResult = { ok: true; quote: RangeQuote } | { ok: false; refusal: RangeRefusal };

function refuse(refusal: RangeRefusal): RangeQuoteResult {
  return { ok: false, refusal };
}

/**
 * The reserve's own arithmetic off a basis snapshot, for an instant estimate and for the tests that pin
 * it to the contract. Unlike the parlay there is no depth to re-price over: the basis is one read, so a
 * "Set stake" quote is one solve, and the stake it shows is the stake the chain charges at the same basis.
 */
export function quoteRange(input: RangeQuoteInput): RangeQuoteResult {
  const { openingPrint, lowPrint, highPrint, side, centerQE6, sigmaE8, tauSec, mode, params, one, decimals, nowMs } = input;
  if (lowPrint <= 0n || highPrint <= lowPrint) return refuse({ kind: "band", lowPrint, highPrint });
  const amount = mode.kind === "fixStake" ? mode.stakeBase : mode.maxPayoutBase;
  if (amount <= 0n) return refuse({ kind: "zero" });

  const insideProbE6 = bandProbE6(openingPrint, lowPrint, highPrint, centerQE6, sigmaE8, tauSec);
  const probRaw = sideProbRaw(insideProbE6, side, one);
  if (probRaw < params.minProbRaw) return refuse({ kind: "long-shot", probRaw, minProbRaw: params.minProbRaw });
  if (probRaw > params.maxProbRaw) return refuse({ kind: "near-certain", probRaw, maxProbRaw: params.maxProbRaw });

  const maxPayoutBase = mode.kind === "fixPayout" ? mode.maxPayoutBase : maxPayoutForStake(mode.stakeBase, probRaw, one, params.marginBps);
  if (maxPayoutBase > params.maxPayoutCapBase) return refuse({ kind: "over-payout-cap", maxPayoutBase, capBase: params.maxPayoutCapBase });
  if (maxPayoutBase <= 0n) return refuse({ kind: "underpriced", stakeBase: amount, maxPayoutBase });
  const stakeBase = floorStake(maxPayoutBase, probRaw, one, params.marginBps);
  if (stakeBase >= maxPayoutBase) return refuse({ kind: "underpriced", stakeBase, maxPayoutBase });

  return {
    ok: true,
    quote: { side, insideProbE6, probRaw, stakeBase, maxPayoutBase, multiplierMilli: multiplierMilli(maxPayoutBase, stakeBase), decimals, quotedAtMs: nowMs },
  };
}
