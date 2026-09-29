// Ported from Masayume 68f7a09:packages/core/src/range/pricing.ts (the RangeMath mirror: `cdfE6`, `probitE4`, `isqrt`,
// `stdE8`, `zOf`) — unchanged. FairValue (A.5.4) uses the same Φ table; the rest of the range pricing mirror joins it in S10b.
import { CDF_TABLE_E6 } from "./cdf-table";

/** The probability scale of the table and of every figure inside the maths. */
export const P_ONE = 1_000_000n;
const E8 = 100_000_000n;
export const Z_STEP_E4 = 500n;
export const Z_MAX_E4 = 40_000n;
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
