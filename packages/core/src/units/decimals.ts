// Ported from Masayume 68f7a09:packages/core/src/units/decimals.ts
const CENTS_PER_UNIT = 100n;

export function oneUnit(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

/** One cent of collateral in base units — the stake rounding floor and the "partially filled" tolerance. */
export function oneCent(decimals: number): bigint {
  return oneUnit(decimals) / CENTS_PER_UNIT;
}
