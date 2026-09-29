// Ported from Masayume 68f7a09:packages/markets/src/react/keys.ts — one key taxonomy (web-stack §3.3), without the
// Somnia SDK's key factories. Stream-owned keys (`price`) are written only by the real-time client (D-049).
const SCOPE = "cwf";

export const keys = {
  /** Boot facts share this prefix, so invalidating it retries them all at once. */
  boot: () => [SCOPE, "boot"] as const,
  clock: () => [SCOPE, "boot", "clock"] as const,
  chain: () => [SCOPE, "boot", "chain"] as const,
  lanes: () => [SCOPE, "lanes"] as const,
  market: (marketId: string | null) => [SCOPE, "market", marketId] as const,
  onchain: (marketId: string | null) => [SCOPE, "onchain", marketId] as const,
  /** Written by the stream (`setQueryData`), `staleTime: Infinity`; never fetched. */
  price: (symbol: string) => [SCOPE, "price", symbol] as const,
  priceHistory: (symbol: string, fromSec: number, toSec: number) => [SCOPE, "priceHistory", symbol, fromSec, toSec] as const,
  bookParams: (seriesId: string | null) => [SCOPE, "bookParams", seriesId] as const,
  positions: (wallet: string | null) => [SCOPE, "positions", wallet] as const,
  claimables: (wallet: string | null) => [SCOPE, "claimables", wallet] as const,
  history: (wallet: string | null) => [SCOPE, "history", wallet] as const,
  vault: (wallet: string | null) => [SCOPE, "vault", wallet] as const,
  balanceSheet: (wallet: string | null) => [SCOPE, "balanceSheet", wallet] as const,
  keychain: (wallet: string | null) => [SCOPE, "keychain", wallet] as const,
  relayStatus: () => [SCOPE, "relayStatus"] as const,
};
