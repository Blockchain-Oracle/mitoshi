/**
 * Launchpads — pure guards (plan S1 1a stub; S17 extends it with `currencyGuard.ts` and the curve; pillar2 B.5).
 *
 * A stablecoin launch is locked to currency "USD" with a typed confirmation; a memecoin's currency is its symbol and
 * may not be a reserved code (ISO-4217 fiat, the Stock Token tickers, "USD"). The full reserved list lives on chain in
 * `LaunchRegistry.isReservedCode`; `currencyGuard.ts` (S17a) mirrors it so the form refuses before a signature.
 */
export * from "./currencyGuard";
export * from "./intents";
export const STABLECOIN_CURRENCY = "USD";

/** A token symbol the launch form accepts: 2–11 upper-case letters or digits, starting with a letter. */
export function isWellFormedSymbol(symbol: string): boolean {
  return /^[A-Z][A-Z0-9]{1,10}$/.test(symbol);
}

/** The typed confirmation must match the currency code exactly (no case folding: the user types what is minted). */
export function typedConfirmMatches(typed: string, code: string): boolean {
  return typed.trim() === code;
}

/** `(sold × 10,000) / threshold`, floored and clamped to 10,000: the graduation progress bar (B.5.2). */
export function graduationProgressBps(quoteReserve: bigint, migrationQuoteThreshold: bigint): number {
  if (migrationQuoteThreshold <= 0n) return 0;
  const bps = (quoteReserve * 10_000n) / migrationQuoteThreshold;
  return Number(bps > 10_000n ? 10_000n : bps < 0n ? 0n : bps);
}
