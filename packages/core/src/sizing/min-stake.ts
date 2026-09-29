// Ported from Masayume 68f7a09:packages/core/src/sizing/min-stake.ts
import { MIN_STAKE_UNITS } from "../constants/sizing";
import { oneUnit } from "../units/decimals";

export function minStakeBase(decimals: number): bigint {
  return oneUnit(decimals) * MIN_STAKE_UNITS;
}

export function belowMinStake(stakeBase: bigint, decimals: number): boolean {
  return stakeBase < minStakeBase(decimals);
}
