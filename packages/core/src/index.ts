// Ported from Masayume 68f7a09:packages/core/src/index.ts — plus Agari's auth/orders/reserves (03b30ab) and the
// pillar-2 modules (stocks, themes, launch). Games, copy, faucet and the testing fixtures are subpath imports
// (`@cwf/core/games`, `@cwf/core/copy`, …), as in Masayume.
export * from "./auth";
export * from "./claims";
export * from "./constants";
export * from "./leverage";
export * from "./lifecycle";
export * from "./market";
export * from "./orders";
export * from "./parlay";
export * from "./ports";
export * from "./private";
export * from "./projection";
export * from "./region";
export * from "./reserves";
export * from "./schemas";
export * from "./sizing";
export * from "./types";
export * from "./units";
export * from "./urls";
export * from "./strategies";
export * from "./surface";
export * from "./vault";
export * from "./x";
export * from "./stocks";
export * from "./themes";
export * from "./tx";
export * from "./launch";
// S17b (integration/t1): the bonding-curve maths and its shared TS<->Solidity vectors. `NETWORKS`/`networkFrom` come
// from `./constants` and `./launch/currencyGuard` from `./launch`.
export * from "./launch/curve";
export { buildCurveVectors, type CurveVectors } from "./launch/curveVectors";
// `range/math`'s `isqrt` is the same ⌊√x⌋ as `launch/curve`'s; the curve's stays the package export.
export { P_ONE, Z_STEP_E4, Z_MAX_E4, cdfE6, probitE4, stdE8, zOf, isqrt as rangeIsqrt } from "./range/math";
export * from "./fair/fair";
export { lnWad } from "./fair/lnwad";
export { buildFairVectors, type FairVectors } from "./fair/fairVectors";
