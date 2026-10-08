/**
 * The display feed's shapes (S23a, D-196): the price a chart line moves on — never what a Window settles on. Settlement,
 * the seed maker's fair value, halt-watch, `price_ticks` and `/prices/latest` read the RedStone `SpotFeed`
 * (`prices/spot.ts`); nothing here is joined into it.
 */
import type { TickerSymbol } from "@cwf/core";

/** Where a display tick came from: a Coinbase trade, the five-venue median, an Alpaca IEX trade, or RedStone (10 s). */
export type DisplaySource = "coinbase" | "venues" | "alpaca" | "redstone";

export interface DisplayQuote {
  symbol: TickerSymbol;
  priceE8: bigint;
  /** The source's own time of the trade or print, in ms. */
  atMs: number;
  source: DisplaySource;
}

export interface DisplayFeed {
  /** The newest display quote for a symbol whatever its age, or null before the first. */
  latest(symbol: TickerSymbol): DisplayQuote | null;
  subscribe(listener: (quote: DisplayQuote) => void): () => void;
}

export interface DisplayFeedHandle extends DisplayFeed {
  start(): void;
  stop(): void;
}

export type Fetch = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/**
 * A positive decimal (string, or a finite number from a JSON body) → × 10⁸, truncating past 8 places. Display only:
 * the signed-print path keeps `decimalToE8`'s strictness. Null for anything that isn't a positive decimal.
 */
export function displayE8(raw: unknown): bigint | null {
  const text = typeof raw === "number" ? (Number.isFinite(raw) && raw > 0 ? raw.toFixed(8) : null) : typeof raw === "string" ? raw.trim() : null;
  const m = text ? DECIMAL.exec(text) : null;
  if (!m) return null;
  const e8 = BigInt(m[1]!) * 100_000_000n + BigInt((m[2] ?? "").slice(0, 8).padEnd(8, "0"));
  return e8 > 0n ? e8 : null;
}
