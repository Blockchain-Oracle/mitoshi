// Ported from Masayume 68f7a09:packages/core/src/units/bps.ts
import { BPS_DENOMINATOR } from "../constants/sizing";
import type { Side } from "../types/market";
import { oneUnit } from "./decimals";

const BPS = BigInt(BPS_DENOMINATOR);

export function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Raw price-grid units (probability × 10^decimals) → basis points. */
export function priceRawToBps(priceRaw: bigint, decimals: number): number {
  return Number((priceRaw * BPS) / oneUnit(decimals));
}

export function bpsToPriceRaw(bps: number, decimals: number): bigint {
  return (BigInt(Math.round(bps)) * oneUnit(decimals)) / BPS;
}

export function complementBps(bps: number): number {
  return BPS_DENOMINATOR - bps;
}

/** Cents per $1 contract, clamped to [1, 99] so a displayed price is never 0 or 100. */
export function bpsToOddsCents(bps: number): number {
  return clampInt(Math.round(bps / 100), 1, 99);
}

/** The venue quotes everything in UP (YES) terms; a DOWN position pays 1 − p. */
export function ownTermsPriceRaw(yesPriceRaw: bigint, side: Side, decimals: number): bigint {
  return side === "up" ? yesPriceRaw : oneUnit(decimals) - yesPriceRaw;
}
