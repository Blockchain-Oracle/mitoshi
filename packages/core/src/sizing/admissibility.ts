// Ported from Masayume 68f7a09:packages/core/src/sizing/admissibility.ts
import { ADMISSIBLE_MAX_BPS, ADMISSIBLE_MIN_BPS } from "../constants/sizing";

export type AdmissibilityBlocker = "outside-band-low" | "outside-band-high";

/** Admissible iff 2% ≤ p ≤ 97%, both edges inclusive (FR-8). */
export function isAdmissibleBps(priceBps: number): boolean {
  return priceBps >= ADMISSIBLE_MIN_BPS && priceBps <= ADMISSIBLE_MAX_BPS;
}

export function admissibilityBlocker(priceBps: number): AdmissibilityBlocker | null {
  if (priceBps < ADMISSIBLE_MIN_BPS) return "outside-band-low";
  if (priceBps > ADMISSIBLE_MAX_BPS) return "outside-band-high";
  return null;
}
