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

/** "3 d", "5 h", "12 m", "now" — how old a launch or a trade is (R6 money). */
export function ageText(sec: number, nowSec: number): string {
  const s = Math.max(0, nowSec - sec);
  if (s < 60) return "now";
  if (s < 3_600) return `${Math.floor(s / 60)} m`;
  if (s < 86_400) return `${Math.floor(s / 3_600)} h`;
  return `${Math.floor(s / 86_400)} d`;
}

/** A 1e18 price as a number, for drawing only (candles, sparklines). */
export const priceNum = (priceE18: bigint | string): number => Number(BigInt(priceE18)) / 1e18;

/** A column's dollars: cents under $1,000, whole dollars above ("$1,204"). */
export const usdShort = (base: bigint | string): string => {
  const b = BigInt(base);
  return b >= 1_000_000_000n ? `$${formatBaseUnits(b, DECIMALS, { minDp: 0, maxDp: 0 })}` : usdText(b);
};

/** Market cap at the curve price: supply × price. */
export const capBase = (totalSupply: bigint, priceE18: bigint) => (totalSupply * priceE18) / E18;
