/**
 * The house liquidity plan for a guarded `(pathUSD, mirror)` pool (plan B.3.4): of the mirror inventory and an equal
 * value of pathUSD, 80 % concentrated over the USD band ±12 % and 20 % full range, plus a pathUSD bid ladder over
 * [−15 %, −1 %] of the token price (pathUSD-only positions above the current tick). Ticks come from USD bands, rounded
 * outward to the tick spacing. Pure: the scripts turn the positions into `MINT_POSITION`s.
 */
import { BPS } from "./guard";
import { amountsForLiquidity, ceilTick, floorTick, getLiquidityForAmount0, getLiquidityForAmounts, getSqrtPriceAtTick, getTickAtSqrtPrice, tickAtTokenPrice } from "./liquidity";

export interface HousePosition {
  label: "concentrated" | "full-range" | `ladder-${number}`;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amount0: bigint;
  amount1: bigint;
}

export interface HousePlanInput {
  /** The pool's current (or initial) sqrt price. */
  sqrtPriceX96: bigint;
  /** USD per whole token × 1e18 (reference × multiplier). */
  tokenPriceE18: bigint;
  /** Mirror units to seed (6 decimals). */
  mirror: bigint;
  /** pathUSD units paired with them (defaults to the equal value at `tokenPriceE18`). */
  pathUsd?: bigint;
  /** pathUSD units for the bid ladder (0 = none). */
  ladderUsd: bigint;
  spacing?: number;
  concentratedBps?: number;
  concentratedWidthBps?: number;
  ladderFromBps?: number;
  ladderToBps?: number;
  ladderRungs?: number;
}

export const HOUSE = { concentratedBps: 8_000, concentratedWidthBps: 1_200, ladderFromBps: 100, ladderToBps: 1_500, ladderRungs: 7 } as const;
const FULL = 887_220;

export function planHouse(p: HousePlanInput): HousePosition[] {
  const spacing = p.spacing ?? 60;
  const P = p.tokenPriceE18;
  const pathUsd = p.pathUsd ?? (p.mirror * P) / 10n ** 18n;
  const cBps = BigInt(p.concentratedBps ?? HOUSE.concentratedBps);
  const width = BigInt(p.concentratedWidthBps ?? HOUSE.concentratedWidthBps);
  const out: HousePosition[] = [];
  const add = (label: HousePosition["label"], tickLower: number, tickUpper: number, liquidity: bigint) => {
    if (liquidity === 0n) return;
    const { amount0, amount1 } = amountsForLiquidity(p.sqrtPriceX96, tickLower, tickUpper, liquidity);
    out.push({ label, tickLower, tickUpper, liquidity, amount0, amount1 });
  };
  if (p.mirror > 0n && pathUsd > 0n) {
    // dearer token = lower tick: the +12 % price is the lower tick
    const lower = floorTick(tickAtTokenPrice((P * (BPS + width)) / BPS), spacing);
    const upper = ceilTick(tickAtTokenPrice((P * (BPS - width)) / BPS), spacing);
    const c0 = (pathUsd * cBps) / BPS;
    const c1 = (p.mirror * cBps) / BPS;
    add("concentrated", lower, upper, getLiquidityForAmounts(p.sqrtPriceX96, getSqrtPriceAtTick(lower), getSqrtPriceAtTick(upper), c0, c1));
    add("full-range", -FULL, FULL, getLiquidityForAmounts(p.sqrtPriceX96, getSqrtPriceAtTick(-FULL), getSqrtPriceAtTick(FULL), pathUsd - c0, p.mirror - c1));
  }
  if (p.ladderUsd > 0n) {
    const rungs = p.ladderRungs ?? HOUSE.ladderRungs;
    const from = p.ladderFromBps ?? HOUSE.ladderFromBps;
    const to = p.ladderToBps ?? HOUSE.ladderToBps;
    const step = (to - from) / rungs;
    const current = getTickAtSqrtPrice(p.sqrtPriceX96);
    for (let i = 0; i < rungs; i++) {
      // token price between P(1 − from − (i+1)·step) and P(1 − from − i·step): a cheaper token is a higher tick
      const tickLower = ceilTick(tickAtTokenPrice((P * (BPS - BigInt(Math.round(from + i * step)))) / BPS), spacing);
      const tickUpper = floorTick(tickAtTokenPrice((P * (BPS - BigInt(Math.round(from + (i + 1) * step)))) / BPS), spacing);
      if (tickLower <= current || tickUpper <= tickLower) throw new Error(`ladder rung ${i} is not above the current tick`);
      const usd = p.ladderUsd / BigInt(rungs);
      add(`ladder-${i}`, tickLower, tickUpper, getLiquidityForAmount0(getSqrtPriceAtTick(tickLower), getSqrtPriceAtTick(tickUpper), usd));
    }
  }
  return out;
}
