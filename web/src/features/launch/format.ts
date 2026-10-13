// `/launch*`'s number words (R4-11, D-227): a memecoin's price is tiny, so it reads in significant digits; coins and
// pathUSD are TIP-20 base units at 6 decimals. Display only — every amount the app sends stays a bigint.
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core";

export const DECIMALS = 6;
const E18 = 10n ** 18n;

/** pathUSD per coin, from a curve price at 1e18 (both sides 6 decimals): "$0.0000012", "$1.04". */
export function priceText(priceE18: bigint): string {
  if (priceE18 <= 0n) return "$0";
  if (priceE18 >= E18 / 100n) return `$${formatBaseUnits(priceE18, 18, { minDp: 2, maxDp: 4 })}`;
  const digits = priceE18.toString().padStart(18, "0");
  const lead = digits.search(/[1-9]/);
  return `$0.${digits.slice(0, lead)}${digits.slice(lead, lead + 3).replace(/0+$/, "")}`;
}

export const usdText = (base: bigint) => `$${formatBaseUnits(base, DECIMALS, { minDp: 2, maxDp: 2 })}`;
export const coinText = (base: bigint) => formatBaseUnits(base, DECIMALS, { minDp: 0, maxDp: 0 });
export const bpsText = (bps: bigint | number) => `${(Number(bps) / 100).toFixed(Number(bps) % 100 === 0 ? 0 : 2)}%`;

/** Parse a typed pathUSD or coin amount into base units; null when it isn't a number. */
export const parseAmount = (text: string): bigint | null => parseDecimalToBaseUnits(text.trim().replace(/,/g, "") || "x", DECIMALS);

/** Market cap at the curve price: supply × price. */
export const capBase = (totalSupply: bigint, priceE18: bigint) => (totalSupply * priceE18) / E18;
