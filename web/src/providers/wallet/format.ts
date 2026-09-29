import { formatBaseUnits } from "@cwf/core/units";

/** "0x1234…abcd" — the header and the account modal show the same short form. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Dollars with two decimals from 6-decimal base units (§2.1.4 dollars first); "—" when unread. */
export function dollars(base: bigint | null | undefined, decimals = 6): string {
  return base === null || base === undefined ? "—" : `$${formatBaseUnits(base, decimals, { maxDp: 2, minDp: 2 })}`;
}
