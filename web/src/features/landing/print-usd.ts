// A signed print in dollars for the landing (R4-13a, D-227): exact from its 8-decimal integer, rounded half up to the
// cent — never through a float, so a print reads as the chain stored it.
const CENT_E8 = 1_000_000n;

export function printUsd(e8: string | bigint): string {
  const v = BigInt(e8);
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const cents = (abs + CENT_E8 / 2n) / CENT_E8;
  const whole = (cents / 100n).toLocaleString("en-US");
  const frac = (cents % 100n).toString().padStart(2, "0");
  return `${negative ? "−" : ""}$${whole}.${frac}`;
}
