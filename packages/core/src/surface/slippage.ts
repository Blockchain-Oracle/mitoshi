// Ported from Masayume 68f7a09:packages/core/src/surface/slippage.ts
import { BPS_DENOMINATOR } from "../constants/sizing";
import { walkBudget, walkQuantity } from "../leverage/sizing";
import type { BookLevelView } from "../types/trading";
import { priceRawToBps } from "../units/bps";
import { oneUnit } from "../units/decimals";
import { mulBps } from "../units/money";
import { sumQuantity } from "./structure";

/** The stakes the ladder prices, in whole collateral units — a fixed ruler so two Windows read side by side. */
export const STAKE_LADDER_UNITS: readonly bigint[] = [1n, 5n, 10n, 25n, 50n, 100n, 250n];

export function stakeLadder(decimals: number): bigint[] {
  const one = oneUnit(decimals);
  return STAKE_LADDER_UNITS.map((units) => units * one);
}

export interface SlippageRow {
  stakeBase: bigint;
  /** Contracts the stake buys off the visible asks, floored to the venue's lot. */
  contractsRaw: bigint;
  /** What those contracts cost — at or under the stake, never over. */
  costBase: bigint;
  /** Cost-weighted price per contract, in the side's own terms; null when the stake buys nothing. */
  avgPriceBps: number | null;
  /** The deepest level the walk touched. */
  worstPriceBps: number | null;
  /** How far the average sits above the best ask — the slippage a taker of this size pays. */
  slippageBps: number | null;
  /** True when the stake would take every visible level — what lies deeper is not read here. */
  exhausted: boolean;
  /** Contracts × (1 − settlement fee); null until the fee is read, never assumed zero. */
  payoutIfRightBase: bigint | null;
}

/**
 * What each stake really buys, walking the asks exactly as the venue fills an IOC taker
 * (`walkBudget` / `walkQuantity`, the same arithmetic the reserves mirror on chain). The ticket
 * guards its own order with a cost cap; this ladder shows the book itself, unguarded.
 */
export function slippageLadder(
  asks: readonly BookLevelView[],
  stakesBase: readonly bigint[],
  decimals: number,
  lotRaw: bigint,
  feeBps: number | null,
): SlippageRow[] {
  const one = oneUnit(decimals);
  const levels = asks.map((level) => ({ priceRaw: level.priceRaw, quantityRaw: level.quantityRaw }));
  const visibleRaw = sumQuantity(asks);
  const costOfVisible = walkQuantity(levels, false, one, visibleRaw).costBase;
  const bestBps = asks[0]?.priceBps ?? null;

  return stakesBase.map((stakeBase) => {
    const contractsRaw = walkBudget(levels, false, one, stakeBase, lotRaw);
    const walk = walkQuantity(levels, false, one, contractsRaw);
    const avgPriceBps = contractsRaw > 0n ? priceRawToBps((walk.costBase * one) / contractsRaw, decimals) : null;
    const worstPriceBps = contractsRaw > 0n ? priceRawToBps(walk.limitYesRaw, decimals) : null;
    return {
      stakeBase,
      contractsRaw,
      costBase: walk.costBase,
      avgPriceBps,
      worstPriceBps,
      slippageBps: avgPriceBps !== null && bestBps !== null ? avgPriceBps - bestBps : null,
      exhausted: stakeBase >= costOfVisible,
      payoutIfRightBase: feeBps === null ? null : mulBps(contractsRaw, BPS_DENOMINATOR - feeBps),
    };
  });
}
