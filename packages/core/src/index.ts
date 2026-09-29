/** @cwf/core — pure domain logic shared by web, ops and mobile. No network, storage or chain I/O here. */
export const NETWORKS = { mainnet: 4217, testnet: 42431 } as const;
export type Network = keyof typeof NETWORKS;

/** Resolves the configured network name, defaulting to testnet. */
export function networkFrom(value: string | undefined): Network {
  return value === "mainnet" ? "mainnet" : "testnet";
}
export * from "./launch/currencyGuard";
export * from "./launch/curve";
export { buildCurveVectors, type CurveVectors } from "./launch/curveVectors";
// `range/math`'s `isqrt` is the same ⌊√x⌋ as `launch/curve`'s; the curve's stays the package export.
export { P_ONE, Z_STEP_E4, Z_MAX_E4, cdfE6, probitE4, stdE8, zOf, isqrt as rangeIsqrt } from "./range/math";
export * from "./fair/fair";
export { lnWad } from "./fair/lnwad";
export { buildFairVectors, type FairVectors } from "./fair/fairVectors";
