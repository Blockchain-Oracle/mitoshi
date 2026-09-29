/**
 * The StockGuardHook's price and band arithmetic, bit for bit (twin of `contracts/src/stocks/libs/GuardMath.sol` and
 * the session rules of `hooks/GuardTypes.sol`; plan B.3.3, D-022). Pools are `(pathUSD = currency0, mirror = currency1)`,
 * both 6 decimals, so the v4 price is mirror units per pathUSD unit = 1 / tokenPrice. Token price = share price ×
 * `uiMultiplier` (× never ÷). Shared vectors: `guard.vectors.json` (checked by `GuardMath.t.sol` and `guard.test.ts`).
 * Pure bigint maths; no I/O.
 */
export const WAD = 10n ** 18n;
export const BPS = 10_000n;
export const Q96 = 1n << 96n;
export const Q192 = 1n << 192n;
export const MIN_SQRT_PRICE = 4295128739n;
export const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;
export const MAX_BAND_BPS = 2_000;

export class GuardMathError extends Error {}

/** floor(√n) for n ≥ 0 (OpenZeppelin `Math.sqrt` rounds down too). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new GuardMathError("negative");
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** USD per whole mirror token × 1e18 = share × multiplier / 1e18 (floor). */
export const tokenPriceE18 = (sharePriceE18: bigint, uiMultiplierE18: bigint): bigint => (sharePriceE18 * uiMultiplierE18) / WAD;

/** sqrtPriceX96 = floor(√(2^192 × 1e18 / tokenPrice)), inside v4's `[MIN_SQRT_PRICE, MAX_SQRT_PRICE)`. */
export function sqrtFromTokenPrice(tokenPrice: bigint): bigint {
  if (tokenPrice <= 0n) throw new GuardMathError("ZeroPrice");
  const s = isqrt((Q192 * WAD) / tokenPrice);
  if (s < MIN_SQRT_PRICE || s >= MAX_SQRT_PRICE) throw new GuardMathError(`SqrtPriceOutOfRange(${s})`);
  return s;
}

/** USD per whole mirror token × 1e18 at `sqrtPriceX96`: floor(1e18 × 2^192 / sqrtP²). */
export const tokenPriceFromSqrt = (sqrtPriceX96: bigint): bigint => ((WAD << 96n) * Q96) / sqrtPriceX96 / sqrtPriceX96;

/** The band at ±`bps` as v4 sqrt prices; a higher token price is a lower v4 price, so `lo` comes from P·(1+b). */
export function band(tokenPrice: bigint, bps: number | bigint): { lo: bigint; hi: bigint } {
  const b = BigInt(bps);
  if (b <= 0n || b >= BPS) throw new GuardMathError(`BadBand(${b})`);
  return { lo: sqrtFromTokenPrice((tokenPrice * (BPS + b)) / BPS), hi: sqrtFromTokenPrice((tokenPrice * (BPS - b)) / BPS) };
}

/** The after-swap rule: inside [lo, hi], or strictly toward the band from outside without passing its far edge. */
export function allowed(pre: bigint, post: bigint, lo: bigint, hi: bigint): boolean {
  if (post >= lo && post <= hi) return true;
  if (pre < lo) return post > pre && post < lo;
  if (pre > hi) return post < pre && post > hi;
  return false;
}

export type Session = "REGULAR" | "EXTENDED" | "CLOSED" | "UNKNOWN";
/** Solidity `SessionState` / `IThemeOracle.currentSession` numbering. */
export const SESSIONS: readonly Session[] = ["REGULAR", "EXTENDED", "CLOSED", "UNKNOWN"];

export interface GuardParams {
  bandRegularBps: number;
  bandExtendedBps: number;
  bandClosedBps: number;
  maxAgeRegular: number;
  maxAgeClosed: number;
  caWindow: number;
  maxSyncAge: number;
  offHoursMode: "REFUSE" | "WIDEN";
  requireVerified: boolean;
}

/** Q-024 defaults (`GuardTypes.defaults()`). */
export const DEFAULT_GUARD: GuardParams = {
  bandRegularBps: 150,
  bandExtendedBps: 300,
  bandClosedBps: 500,
  maxAgeRegular: 120,
  maxAgeClosed: 345_600,
  caWindow: 900,
  maxSyncAge: 93_600,
  offHoursMode: "WIDEN",
  requireVerified: true,
};

/** Band, allowed reference age and whether the session trades (`GuardTypes.sessionRule`). */
export function sessionRule(g: GuardParams, s: Session): { bps: number; maxAge: number; open: boolean } {
  if (s === "REGULAR") return { bps: g.bandRegularBps, maxAge: g.maxAgeRegular, open: true };
  if (s === "EXTENDED") return { bps: g.bandExtendedBps, maxAge: g.maxAgeRegular, open: true };
  return { bps: g.bandClosedBps, maxAge: g.maxAgeClosed, open: g.offHoursMode === "WIDEN" };
}

/** Inside `window` s either side of a scheduled multiplier switch (`effectiveAt` ≤ 1 = never scheduled). */
export function inCorporateActionWindow(nowSec: bigint, effectiveAt: bigint, window: number): boolean {
  if (effectiveAt <= 1n || window === 0) return false;
  const d = nowSec > effectiveAt ? nowSec - effectiveAt : effectiveAt - nowSec;
  return d < BigInt(window);
}

/** The band in USD per token (for the CTA "Outside ±X % of reference"): [P·(1−b), P·(1+b)] × 1e18. */
export function usdBand(tokenPrice: bigint, bps: number): { minE18: bigint; maxE18: bigint } {
  const b = BigInt(bps);
  return { minE18: (tokenPrice * (BPS - b)) / BPS, maxE18: (tokenPrice * (BPS + b)) / BPS };
}
