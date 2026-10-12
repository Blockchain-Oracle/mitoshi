import { formatBaseUnits } from "@cwf/core";

/** Owarine 90a91d71 `features/earn/format.ts`, in dollars: no float on the money path. */
export const DECIMALS = 6;

/** `sharePrice.toFixed(4)` from the raw share price. */
export function formatSharePrice(sharePriceRaw: bigint, decimals = DECIMALS): string {
  return formatBaseUnits(sharePriceRaw, decimals, { minDp: 4, maxDp: 4, group: false });
}

/** `((sharePrice − 1) × 100).toFixed(2)` — the delta chip; null at or below par. */
export function sharePriceDeltaPct(sharePriceRaw: bigint, one: bigint): string | null {
  if (sharePriceRaw <= one + one / 10_000n) return null;
  const hundredths = ((sharePriceRaw - one) * 10_000n) / one;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}%`;
}

/** "$1,234.56" — two decimals, grouped. */
export function money2(base: bigint, decimals = DECIMALS): string {
  return `$${formatBaseUnits(base < 0n ? -base : base, decimals, { minDp: 2, maxDp: 2 })}`;
}

/** Basis points as a percentage to one decimal. */
export function bpsPct(bps: number): string {
  const tenths = Math.round(bps / 10);
  return `${Math.floor(tenths / 10)}.${tenths % 10}%`;
}

/** Quarter, half, three quarters, all of what the account holds, floored to cents; 50/100/250/500 when it holds nothing. */
export function quickAmounts(walletBase: bigint, decimals = DECIMALS): string[] {
  if (walletBase <= 0n) return ["50", "100", "250", "500"];
  const cent = 10n ** BigInt(Math.max(0, decimals - 2));
  return [1n, 2n, 3n, 4n].map((q) => formatBaseUnits((((walletBase * q) / 4n) / cent) * cent, decimals, { minDp: 2, maxDp: 2, group: false }));
}
