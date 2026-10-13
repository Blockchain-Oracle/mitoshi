/**
 * Why a Range or Moonshot round can't be placed right now, as the CTA's label (D-045) — one mapping for both tickets
 * (R4-5, D-227: Moonshot named only four and read "Quote unavailable" for the rest, or met the cap after the passkey).
 * Every refusal `RangePricing` and the reserve's caps raise is named before the hold.
 */
import type { Diagnosis } from "@cwf/core";
import { RANGE } from "./copy";

/** The quote's refusal, by its error name, or null when the quote has none. */
export function refusalLabel(error: Diagnosis | null): string | null {
  if (!error) return null;
  switch (error.errorName) {
    case "ThinBook":
      return RANGE.cta.thin;
    case "WideBook":
      return RANGE.cta.wide;
    case "WindowDecided":
      return RANGE.cta.decided;
    case "LongShot":
      return RANGE.cta.longShot;
    case "NearCertain":
    case "Underpriced":
      return RANGE.cta.nearCertain;
    case "TooLate":
      return RANGE.cta.tooLate;
    case "TooFar":
      return RANGE.cta.tooFar;
    case "StaleBasis":
      return RANGE.cta.stale;
    case "OverPayoutCap":
    case "OverExpiryCap":
    case "OverExposure":
    case "InsufficientLiquidity":
      return RANGE.cta.reserveCap;
    case "MarketNotTrading":
      return RANGE.cta.tooLate;
    default:
      return error.kind === "reserve-cap" ? RANGE.cta.reserveCap : RANGE.cta.unavailable;
  }
}

/** The caps' refusal (`checkCapacity`): "Won't fit this expiry" for the per-expiry cap, else over the reserve's cap. */
export function capacityLabel(refusal: Diagnosis | null): string | null {
  if (!refusal) return null;
  return refusal.errorName === "OverExpiryCap" ? RANGE.cta.expiryFull : RANGE.cta.reserveCap;
}
