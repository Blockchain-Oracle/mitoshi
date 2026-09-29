// Ported from Agari 03b30ab:packages/core/src/market/tickers.ts — the Solana registry (xStocks/Ondo/PreStocks mints,
// Pyth feeds, baskets, valuation lanes) replaced by the Tempo universe: nine RedStone-covered names, SPCX and three
// crypto assets (plan S1 1a; C.4.4 archive feeds; docs/specs/engine.md A.1.1 `uint16 ticker`).
import { GAP_CADENCE_SEC, type LaneBasis } from "../types/market";

/**
 * The asset universe the engine can list.
 *
 * This registry says what each ticker IS: its on-chain ticker number, its signed feeds and its brand. It does not say
 * whether a lane is live: that depends on a signed source covering the Window (dated policy versions per Series), so a
 * ticker here can still read "paused: no signed source" (SPCX on testnet, Q-011).
 */
export const STOCK_SYMBOLS = ["TSLA", "NVDA", "AAPL", "MSFT", "META", "GOOGL", "AMZN", "PLTR", "AMD", "SPCX"] as const;
export const CRYPTO_SYMBOLS = ["BTC", "ETH", "SOL"] as const;
export const TICKER_SYMBOLS = [...STOCK_SYMBOLS, ...CRYPTO_SYMBOLS] as const;
export type StockSymbol = (typeof STOCK_SYMBOLS)[number];
export type CryptoSymbol = (typeof CRYPTO_SYMBOLS)[number];
export type TickerSymbol = (typeof TICKER_SYMBOLS)[number];

/** Signed prints are normalized to this exponent on-chain (price × 10⁻⁸), whatever the source's own. */
export const PRINT_EXPO = -8;

/** The `--brand-<slug>` custom property in the icon stylesheet and the asset disc fill. */
export const BRAND_SLUGS = ["tesla", "nvidia", "apple", "microsoft", "meta", "google", "amazon", "palantir", "amd", "spacex", "bitcoin", "ethereum", "solana"] as const;
export type BrandSlug = (typeof BRAND_SLUGS)[number];

/** The asset's own colour: the issuer's mark colour; the icon stylesheet mirrors it as `--brand-<slug>`. */
export interface Brand {
  slug: BrandSlug;
  /** `#RRGGBB`, upper-case. */
  hex: string;
}

export interface Ticker {
  symbol: TickerSymbol;
  /**
   * The engine's `uint16 ticker` in `seriesId = keccak256(abi.encode(ticker, cadenceSec, basis))`. Permanent: a number
   * is never reused or renumbered, because it is part of every Series id.
   */
  tickerId: number;
  name: string;
  kind: "stock" | "crypto";
  /** Alpaca calendar/bars symbol; null for crypto, which has no exchange session. */
  alpacaSymbol: string | null;
  /** RedStone `redstone-primary-prod` data feed id; null where RedStone has no feed (SPCX). */
  redstoneFeedId: string | null;
  /** RedStone's 24/7 stock feed (`<T>---24_7`) behind the `stock24` lane; null for crypto and uncovered names. */
  redstone24x7FeedId: string | null;
  /** Chainlink Data Streams feed on mainnet (paid; Q-011); filled by the stage that licenses it. */
  dataStreamsFeedId: string | null;
  /** The lanes this asset may list on. */
  lanes: readonly LaneBasis[];
  /** Typed on the asset disc when no glyph is drawn, and in share text. */
  monogram: string;
  brand: Brand;
}

const STOCK_LANES: readonly LaneBasis[] = ["regular", "gap", "stock24"];
const CRYPTO_LANES: readonly LaneBasis[] = ["crypto24"];
const brand = (slug: BrandSlug, hex: string): Brand => ({ slug, hex });

function stock(symbol: StockSymbol, tickerId: number, name: string, monogram: string, b: Brand, redstone = true): Ticker {
  return {
    symbol, tickerId, name, kind: "stock", alpacaSymbol: symbol,
    redstoneFeedId: redstone ? symbol : null, redstone24x7FeedId: redstone ? `${symbol}---24_7` : null, dataStreamsFeedId: null,
    lanes: STOCK_LANES, monogram, brand: b,
  };
}

function crypto(symbol: CryptoSymbol, tickerId: number, name: string, monogram: string, b: Brand): Ticker {
  return {
    symbol, tickerId, name, kind: "crypto", alpacaSymbol: null,
    redstoneFeedId: symbol, redstone24x7FeedId: null, dataStreamsFeedId: null, lanes: CRYPTO_LANES, monogram, brand: b,
  };
}

export const TICKERS: Readonly<Record<TickerSymbol, Ticker>> = {
  TSLA: stock("TSLA", 1, "Tesla", "T", brand("tesla", "#CC0000")),
  NVDA: stock("NVDA", 2, "NVIDIA", "N", brand("nvidia", "#76B900")),
  AAPL: stock("AAPL", 3, "Apple", "A", brand("apple", "#111111")),
  MSFT: stock("MSFT", 4, "Microsoft", "M", brand("microsoft", "#0078D4")),
  META: stock("META", 5, "Meta", "M", brand("meta", "#0467DF")),
  GOOGL: stock("GOOGL", 6, "Alphabet", "G", brand("google", "#4285F4")),
  AMZN: stock("AMZN", 7, "Amazon", "A", brand("amazon", "#FF9900")),
  PLTR: stock("PLTR", 8, "Palantir", "P", brand("palantir", "#101113")),
  AMD: stock("AMD", 9, "AMD", "A", brand("amd", "#ED1C24")),
  /** SpaceX listed on Nasdaq 2026-06-12. No RedStone feed: its only signed source is Data Streams on mainnet (Q-011). */
  SPCX: stock("SPCX", 10, "SpaceX", "S", brand("spacex", "#005288"), false),
  BTC: crypto("BTC", 101, "Bitcoin", "₿", brand("bitcoin", "#F7931A")),
  ETH: crypto("ETH", 102, "Ether", "Ξ", brand("ethereum", "#627EEA")),
  SOL: crypto("SOL", 103, "Solana", "S", brand("solana", "#9945FF")),
};

export const isTickerSymbol = (v: unknown): v is TickerSymbol => typeof v === "string" && (TICKER_SYMBOLS as readonly string[]).includes(v);
export const isStockSymbol = (v: unknown): v is StockSymbol => typeof v === "string" && (STOCK_SYMBOLS as readonly string[]).includes(v);

/** Whether a ticker may be listed on a lane at all: stocks never on `crypto24`, crypto only there. */
export const laneListable = (symbol: TickerSymbol, basis: LaneBasis): boolean => TICKERS[symbol].lanes.includes(basis);

/** Tickers with a RedStone feed: the ones testnet can list today. */
export const REDSTONE_TICKERS: readonly TickerSymbol[] = TICKER_SYMBOLS.filter((s) => TICKERS[s].redstoneFeedId !== null);

const BY_TICKER_ID = new Map(TICKER_SYMBOLS.map((symbol) => [TICKERS[symbol].tickerId, TICKERS[symbol]] as const));

export function tickerById(tickerId: number): Ticker | null {
  return BY_TICKER_ID.get(tickerId) ?? null;
}

const LANE_SUFFIX: Record<LaneBasis, string> = { regular: "", gap: "gap", crypto24: "", stock24: "24" };

/**
 * The ops lane key (roller heartbeat, `/session.lanes`): `TSLA-5m` Regular, `TSLA-gap` Gap, `TSLA-24-5m` the 24/7 stock
 * lane, `BTC-5m` crypto. Cadences count minutes (`TSLA-60m`), not `formatCadence`'s `1h`.
 */
export function laneKey(symbol: TickerSymbol, basis: LaneBasis, cadenceSec: number): string {
  if (!laneListable(symbol, basis)) return `#${symbol}-${basis}-${cadenceSec}`;
  if (basis === "gap") return `${symbol}-gap`;
  const mid = LANE_SUFFIX[basis];
  return `${symbol}${mid ? `-${mid}` : ""}-${cadenceSec / 60}m`;
}

export interface LaneKeyParts {
  symbol: TickerSymbol;
  basis: LaneBasis;
  cadenceSec: number;
}

/** The inverse of `laneKey`; null for anything else (an off-lane key names no lane). */
export function parseLaneKey(key: string): LaneKeyParts | null {
  const parts = key.split("-");
  const symbol = parts[0];
  if (!isTickerSymbol(symbol)) return null;
  if (parts.length === 2 && parts[1] === "gap") return laneListable(symbol, "gap") ? { symbol, basis: "gap", cadenceSec: GAP_CADENCE_SEC } : null;
  const minutesPart = parts.length === 2 ? parts[1] : parts.length === 3 && parts[1] === "24" ? parts[2] : null;
  const minutes = minutesPart ? /^(\d+)m$/.exec(minutesPart) : null;
  if (!minutes) return null;
  const cadenceSec = Number(minutes[1]) * 60;
  if (cadenceSec <= 0) return null;
  const basis: LaneBasis = parts.length === 3 ? "stock24" : TICKERS[symbol].kind === "crypto" ? "crypto24" : "regular";
  return laneListable(symbol, basis) ? { symbol, basis, cadenceSec } : null;
}

/** The registry ticker an asset symbol identifies; null for an unknown asset. */
export function assetTicker(symbol: string): Ticker | null {
  return isTickerSymbol(symbol) ? TICKERS[symbol] : null;
}
