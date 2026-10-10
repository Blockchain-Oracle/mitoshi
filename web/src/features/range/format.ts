// Ported from Masayume 68f7a09:web/src/features/range/format.ts — prints in cents (the engine's e-8 print / 1e6, D-172).
import { PRINT_DECIMALS } from "@cwf/core/range";
import { formatOracleRaw } from "@cwf/core/units";

const CENTS = 100n;
/** Under this print a band's edges need cents to be told apart (ETH at $2.4k sits on a $0.20 grid). */
const CENTS_MATTER_BELOW = 10_000_00n;

/** Whole dollars, grouped, from a print in cents — the reference's `fmtUsd0`. */
export function usd0(print: bigint): string {
  return `$${formatOracleRaw(print, PRINT_DECIMALS, 0)}`;
}

/** Dollars and cents from a print. */
export function usd2(print: bigint): string {
  return `$${formatOracleRaw(print, PRINT_DECIMALS, 2)}`;
}

/** A band edge: the reference's whole dollars where the asset trades in the tens of thousands, cents below that. */
export function usdBand(print: bigint): string {
  return print < CENTS_MATTER_BELOW ? usd2(print) : usd0(print);
}

/** A dollar amount on the band's grid — `$5`, `$0.20`, `$1,240`. */
const onGrid = new Map<number, Intl.NumberFormat>();
export function usdOnGrid(usd: number, decimals: number): string {
  let f = onGrid.get(decimals);
  if (!f) onGrid.set(decimals, (f = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })));
  return `$${f.format(usd)}`;
}

/** A print in cents → dollars with cents, for the band arithmetic the reference does in dollars. */
export function printToUsd(print: bigint): number {
  return Number(print) / 100;
}

export function usdToPrint(usd: number): bigint {
  return BigInt(Math.round(usd * Number(CENTS)));
}

/** `multiplier.toFixed(1)` without a float — the reference's slip figure. */
export function formatMultiplierTenths(milli: number): string {
  const tenths = Math.round(milli / 100);
  return `${Math.floor(tenths / 10)}.${tenths % 10}×`;
}

/** A probability per 1e6 as `31.6`. */
export function formatProbE6(probE6: bigint): string {
  const tenths = Number(probE6 / 1_000n);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

export function utilizationPct(bps: number): string {
  return String(Math.round(bps / 100));
}
