// Ported from Masayume 68f7a09:packages/core/src/sizing/chips.ts
import { CHIP_FRACTIONS } from "../constants/sizing";
import { oneCent } from "../units/decimals";
import { floorToLot, fractionOf } from "../units/money";
import { minStakeBase } from "./min-stake";

export interface QuickChip {
  label: string;
  stakeBase: bigint;
  enabled: boolean;
}

/** Quick-amount chips scale to the actual spendable balance, floored to whole cents; a chip below the floor is disabled, never dead (FR-8). */
export function quickChips(spendableBase: bigint, decimals: number): QuickChip[] {
  const cent = oneCent(decimals);
  const floor = minStakeBase(decimals);
  return CHIP_FRACTIONS.map(({ label, numerator, denominator }) => {
    const stakeBase = floorToLot(fractionOf(spendableBase, numerator, denominator), cent);
    return { label, stakeBase, enabled: stakeBase >= floor };
  });
}
