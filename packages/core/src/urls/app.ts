// Ported from Masayume 68f7a09:packages/core/src/urls/app.ts
import { isBytes32 } from "../types/primitives";
import { toMarketId, type MarketId, type Side } from "../types/market";

export const MARKET_PARAM = "m";
export const DIRECTION_PARAM = "dir";

export interface MarketsSearch {
  marketId: MarketId | null;
  dir: Side | null;
}

function query(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

/** Deep-link grammar: /markets?m=<marketId>&dir=up|down (UX-DR21). */
export function marketDeepLink(input: { origin?: string; marketId: MarketId; dir?: Side }): string {
  return `${input.origin ?? ""}/markets?${query({ [MARKET_PARAM]: input.marketId, [DIRECTION_PARAM]: input.dir })}`;
}

export function reelsDeepLink(input: { origin?: string; marketId: MarketId }): string {
  return `${input.origin ?? ""}/reels?${query({ [MARKET_PARAM]: input.marketId })}`;
}

/** Accepts a URLSearchParams-like object or Next's parsed searchParams record. */
type SearchInput = { get(name: string): string | null } | Record<string, string | string[] | undefined>;

function readParam(params: SearchInput, key: string): string | null {
  if (typeof (params as { get?: unknown }).get === "function") return (params as { get(name: string): string | null }).get(key);
  const value = (params as Record<string, string | string[] | undefined>)[key];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function parseMarketsSearch(params: SearchInput): MarketsSearch {
  const rawMarket = readParam(params, MARKET_PARAM);
  const rawDir = readParam(params, DIRECTION_PARAM);
  return {
    marketId: rawMarket && isBytes32(rawMarket) ? toMarketId(rawMarket) : null,
    dir: rawDir === "up" || rawDir === "down" ? rawDir : null,
  };
}
