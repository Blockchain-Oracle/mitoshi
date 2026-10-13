// The automate surfaces' money and number words (R4-6, D-227; Owarine 90a91d71 `format.ts` `money`, on Mitoshi's
// dollars): base units in, a display string out — the bigint stays upstream (D-058).
import { formatBaseUnits, USD_DECIMALS } from "@cwf/core";

const ONE = 10n ** BigInt(USD_DECIMALS);
const abs = (b: bigint) => (b < 0n ? -b : b);

/** "$5.00". */
export const usd = (base: bigint) => `$${formatBaseUnits(abs(base), USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;
/** "$5" when whole, else "$2.50": a cap or a limit, where the cents are noise. */
export const usdCap = (base: bigint) => (abs(base) % ONE === 0n ? `$${formatBaseUnits(abs(base), USD_DECIMALS, { minDp: 0, maxDp: 0 })}` : usd(base));
/** "+$1.20" / "−$0.40" / "$0.00". */
export const usdSigned = (base: bigint) => `${base > 0n ? "+" : base < 0n ? "−" : ""}${usd(base)}`;
/** The plain decimal for an input ("12.5"), no symbol, no grouping. */
export const usdInput = (base: bigint) => formatBaseUnits(abs(base), USD_DECIMALS, { minDp: 0, maxDp: 2, group: false });
/** A price cap in cents from the 1e6 raw price ("90¢"); 0 is no cap. */
export const centsOf = (priceRaw: bigint) => `${Number(priceRaw / 10_000n)}¢`;
/** Floats only at the display edge (a chart, a ticker). */
export const dollars = (base: bigint) => Number(base) / Number(ONE);
