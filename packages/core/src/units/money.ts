// Ported from Masayume 68f7a09:packages/core/src/units/money.ts
import { BPS_DENOMINATOR } from "../constants/sizing";

const BPS = BigInt(BPS_DENOMINATOR);

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

export function mulBps(value: bigint, bps: number): bigint {
  return (value * BigInt(bps)) / BPS;
}

export function mulBpsCeil(value: bigint, bps: number): bigint {
  return ceilDiv(value * BigInt(bps), BPS);
}

export function fractionOf(value: bigint, numerator: bigint, denominator: bigint): bigint {
  return (value * numerator) / denominator;
}

export function floorToLot(value: bigint, lot: bigint): bigint {
  return lot > 0n ? (value / lot) * lot : value;
}

export function clampBigint(value: bigint, min: bigint, max: bigint): bigint {
  return value < min ? min : value > max ? max : value;
}
