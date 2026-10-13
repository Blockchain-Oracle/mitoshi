import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core";

/** Owarine 90a91d71 `features/earn/format.ts`, in dollars: no float on the money path. */
export const DECIMALS = 6;

/** `sharePrice.toFixed(4)` from the raw share price. */
export function formatSharePrice(sharePriceRaw: bigint, decimals = DECIMALS): string {
  return formatBaseUnits(sharePriceRaw, decimals, { minDp: 4, maxDp: 4, group: false });
}

/** `((sharePrice − 1) × 100).toFixed(2)` — the change chip; null at or below par (within one basis point). */
export function sharePriceDeltaPct(sharePriceRaw: bigint, one: bigint): string | null {
  if (sharePriceRaw <= one + one / 10_000n) return null;
  const hundredths = ((sharePriceRaw - one) * 10_000n) / one;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}%`;
}

/**
 * The caption under the share price (R4-7 bug 2, D-227): three states, never "up" when it isn't. A change chip means
 * it is above par; within a basis point of 1.0000 it is at par; under that, with shares out, it is carrying a loss.
 */
export function parState(sharePriceRaw: bigint, one: bigint, supplyShares: bigint): "from" | "at" | "below" {
  if (sharePriceDeltaPct(sharePriceRaw, one) !== null) return "from";
  return supplyShares > 0n && sharePriceRaw < one - one / 10_000n ? "below" : "at";
}

/** "$1,234.56" — two decimals, grouped, unsigned. */
export function money2(base: bigint, decimals = DECIMALS): string {
  return `$${formatBaseUnits(base < 0n ? -base : base, decimals, { minDp: 2, maxDp: 2 })}`;
}

/** "+$1.23" / "−$1.23" / "$0.00" — a signed result. */
export function signed2(base: bigint, decimals = DECIMALS): string {
  return base === 0n ? money2(0n, decimals) : `${base < 0n ? "−" : "+"}${money2(base, decimals)}`;
}

/** A base-unit amount as a number for a rolling figure only (the Odometer is display; the money stays a bigint). */
export const forView = (base: bigint, decimals = DECIMALS): number => Number(base) / 10 ** decimals;

/** Basis points as a percentage to one decimal. */
export function bpsPct(bps: number): string {
  const tenths = Math.round(bps / 10);
  return `${Math.floor(tenths / 10)}.${tenths % 10}%`;
}

/** `part` as basis points of `whole`, floored; 0 when there is no whole. */
export const bpsOf = (part: bigint, whole: bigint): number => (whole > 0n && part > 0n ? Number((part * 10_000n) / whole) : 0);

/** Quarter, half, three quarters, all of what the account holds, floored to cents; 50/100/250/500 when it holds nothing. */
export function quickAmounts(walletBase: bigint, decimals = DECIMALS): string[] {
  if (walletBase <= 0n) return ["50", "100", "250", "500"];
  const cent = 10n ** BigInt(Math.max(0, decimals - 2));
  return [1n, 2n, 3n, 4n].map((q) => formatBaseUnits((((walletBase * q) / 4n) / cent) * cent, decimals, { minDp: 2, maxDp: 2, group: false }));
}

/** A typed amount in base units; 0 for nothing or nonsense (the field names the problem). */
export const amountBase = (text: string, decimals = DECIMALS): bigint => parseDecimalToBaseUnits(text.trim() || "0", decimals) ?? 0n;
