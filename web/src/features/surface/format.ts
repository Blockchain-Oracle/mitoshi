// Ported from Owarine 90a91d71:web/src/features/surface/format.ts (R4-11, D-227): basis points as cents, a part of a whole,
// contracts at the book's decimals. Display only.
import { formatBaseUnits } from "@cwf/core/units";

export function centsText(bps: number): string {
  const cents = bps / 100;
  return Number.isInteger(cents) ? `${cents}¢` : `${cents.toFixed(1)}¢`;
}

export function pctOfText(partBps: number, wholeBps: number): string {
  return wholeBps === 0 ? "0.0" : ((partBps * 100) / wholeBps).toFixed(1);
}

export const contractsText = (raw: bigint, decimals: number) => formatBaseUnits(raw, decimals, { minDp: 0, maxDp: 2 });
export const lotText = (raw: bigint, decimals: number) => formatBaseUnits(raw, decimals, { minDp: 0, maxDp: decimals, group: false });
/** The guard's model UP at 1e6 as cents. */
export const fairCents = (fairUpE6: bigint) => `${(Number(fairUpE6) / 10_000).toFixed(1)}¢`;
