/**
 * v4 tick and liquidity maths in bigint, bit for bit with the Solidity (plan B.3.4 "liquidity via a TS
 * `LiquidityAmounts` port"), and the house liquidity plan for a guarded `(pathUSD, mirror)` pool. Pure.
 * Ported from Uniswap v4-core 46c6834:src/libraries/{TickMath,SqrtPriceMath}.sol and v4-periphery
 * 9969eec:src/libraries/LiquidityAmounts.sol (MIT); checked against them by `test/tempo/stocks/LiquidityTwin.t.sol`
 * over `liquidity.vectors.json`.
 */
import { MAX_SQRT_PRICE, MIN_SQRT_PRICE, Q96, sqrtFromTokenPrice } from "./guard";

export const MIN_TICK = -887_272;
export const MAX_TICK = 887_272;
const MAX_U256 = (1n << 256n) - 1n;
const RATIOS: readonly bigint[] = [
  0xfff97272373d413259a46990580e213an, 0xfff2e50f5f656932ef12357cf3c7fdccn, 0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n, 0xff973b41fa98c081472e6896dfb254c0n, 0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n, 0xfcbe86c7900a88aedcffc83b479aa3a4n, 0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n, 0xe7159475a2c29b7443b29c7fa6e889d9n, 0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n, 0x70d869a156d2a1b890bb3df62baf32f7n, 0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n, 0x5d6af8dedb81196699c329225ee604n, 0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n,
];

/** TickMath.getSqrtPriceAtTick. */
export function getSqrtPriceAtTick(tick: number): bigint {
  const abs = BigInt(Math.abs(tick));
  if (abs > BigInt(MAX_TICK)) throw new Error(`InvalidTick(${tick})`);
  let price = abs & 1n ? 0xfffcb933bd6fad37aa2d162d1a594001n : 1n << 128n;
  RATIOS.forEach((r, i) => {
    if (abs & (1n << BigInt(i + 1))) price = (price * r) >> 128n;
  });
  if (tick > 0) price = MAX_U256 / price;
  return (price + (1n << 32n) - 1n) >> 32n;
}

/** TickMath.getTickAtSqrtPrice: the greatest tick whose sqrt price is ≤ `sqrtPriceX96` (binary search, exact). */
export function getTickAtSqrtPrice(sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 < MIN_SQRT_PRICE || sqrtPriceX96 >= MAX_SQRT_PRICE) throw new Error(`InvalidSqrtPrice(${sqrtPriceX96})`);
  let lo = MIN_TICK;
  let hi = MAX_TICK;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (getSqrtPriceAtTick(mid) <= sqrtPriceX96) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const mulDiv = (a: bigint, b: bigint, d: bigint) => (a * b) / d;
const mulDivUp = (a: bigint, b: bigint, d: bigint) => (a * b + d - 1n) / d;
const order = (a: bigint, b: bigint): [bigint, bigint] => (a > b ? [b, a] : [a, b]);
const U128 = (1n << 128n) - 1n;
const u128 = (x: bigint) => {
  if (x > U128) throw new Error("SafeCastOverflow");
  return x;
};

export function getLiquidityForAmount0(sa: bigint, sb: bigint, amount0: bigint): bigint {
  [sa, sb] = order(sa, sb);
  return u128(mulDiv(amount0, mulDiv(sa, sb, Q96), sb - sa));
}

export function getLiquidityForAmount1(sa: bigint, sb: bigint, amount1: bigint): bigint {
  [sa, sb] = order(sa, sb);
  return u128(mulDiv(amount1, Q96, sb - sa));
}

/** LiquidityAmounts.getLiquidityForAmounts. */
export function getLiquidityForAmounts(sqrtP: bigint, sa: bigint, sb: bigint, amount0: bigint, amount1: bigint): bigint {
  [sa, sb] = order(sa, sb);
  if (sqrtP <= sa) return getLiquidityForAmount0(sa, sb, amount0);
  if (sqrtP < sb) {
    const l0 = getLiquidityForAmount0(sqrtP, sb, amount0);
    const l1 = getLiquidityForAmount1(sa, sqrtP, amount1);
    return l0 < l1 ? l0 : l1;
  }
  return getLiquidityForAmount1(sa, sb, amount1);
}

/** SqrtPriceMath.getAmount0Delta / getAmount1Delta (unsigned, with rounding). */
export function getAmount0Delta(sa: bigint, sb: bigint, liquidity: bigint, roundUp: boolean): bigint {
  [sa, sb] = order(sa, sb);
  const n1 = liquidity << 96n;
  const n2 = sb - sa;
  return roundUp ? (mulDivUp(n1, n2, sb) + sa - 1n) / sa : mulDiv(n1, n2, sb) / sa;
}

export function getAmount1Delta(sa: bigint, sb: bigint, liquidity: bigint, roundUp: boolean): bigint {
  const n = sa > sb ? sa - sb : sb - sa;
  return roundUp ? mulDivUp(liquidity, n, Q96) : mulDiv(liquidity, n, Q96);
}

/** What a mint of `liquidity` over [tickLower, tickUpper] at `sqrtP` pays in (rounded up, as PoolManager charges). */
export function amountsForLiquidity(sqrtP: bigint, tickLower: number, tickUpper: number, liquidity: bigint): { amount0: bigint; amount1: bigint } {
  const sa = getSqrtPriceAtTick(tickLower);
  const sb = getSqrtPriceAtTick(tickUpper);
  if (sqrtP <= sa) return { amount0: getAmount0Delta(sa, sb, liquidity, true), amount1: 0n };
  if (sqrtP < sb) return { amount0: getAmount0Delta(sqrtP, sb, liquidity, true), amount1: getAmount1Delta(sa, sqrtP, liquidity, true) };
  return { amount0: 0n, amount1: getAmount1Delta(sa, sb, liquidity, true) };
}

export const floorTick = (t: number, spacing: number) => Math.floor(t / spacing) * spacing || 0;
export const ceilTick = (t: number, spacing: number) => Math.ceil(t / spacing) * spacing || 0;
/** The tick at a USD token price (e18); pathUSD = currency0 so a dearer token is a lower tick. */
export const tickAtTokenPrice = (tokenPriceE18: bigint) => getTickAtSqrtPrice(sqrtFromTokenPrice(tokenPriceE18));
