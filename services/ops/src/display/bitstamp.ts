/**
 * Bitstamp's public OHLC and ticker (S23a): the crypto chart's second source when Coinbase can't be reached (Coinbase
 * and Kraken time out from some networks — measured 2026-10-08 — while Bitstamp answers). Every terminal interval is a
 * native Bitstamp step, so nothing is folded. Display only.
 */
import type { CryptoSymbol } from "@cwf/core";
import type { Candle, DayStats } from "./alpaca-bars";
import { displayE8, type Fetch } from "./types";

const BASE = "https://www.bitstamp.net/api/v2";
const UA = { "user-agent": "mitoshi-chart-candles" };
const MAX_LIMIT = 1000;

const pair = (symbol: CryptoSymbol) => `${symbol.toLowerCase()}usd`;

/** `{ data: { ohlc: [{ timestamp, open, high, low, close }] } }` → ascending `[tMs, o, h, l, c]`. */
export function parseBitstampOhlc(text: string): Candle[] {
  const body = JSON.parse(text) as { data?: { ohlc?: Array<Record<string, string>> }; errors?: unknown };
  if (!body.data?.ohlc) throw new Error(`bitstamp ohlc: ${text.slice(0, 120)}`);
  return body.data.ohlc
    .map((r) => [Number(r.timestamp) * 1000, Number(r.open), Number(r.high), Number(r.low), Number(r.close)] as Candle)
    .filter((c) => c.every((v) => Number.isFinite(v) && v > 0))
    .sort((a, b) => a[0] - b[0]);
}

export async function bitstampCandles(fetchImpl: Fetch, symbol: CryptoSymbol, intervalSec: number, count: number, endMs: number): Promise<Candle[]> {
  const url = `${BASE}/ohlc/${pair(symbol)}/?step=${intervalSec}&limit=${Math.min(MAX_LIMIT, count)}&end=${Math.floor(endMs / 1000)}`;
  const r = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(6_000) });
  if (!r.ok) throw new Error(`bitstamp ohlc HTTP ${r.status}`);
  return parseBitstampOhlc(await r.text()).slice(-count);
}

/** The ticker's 24 h figures: `open_24` (the price 24 h ago), the 24 h high and low, and volume. */
export async function bitstampDay(fetchImpl: Fetch, symbol: CryptoSymbol): Promise<DayStats | null> {
  const r = await fetchImpl(`${BASE}/ticker/${pair(symbol)}/`, { headers: UA, signal: AbortSignal.timeout(5_000) });
  if (!r.ok) return null;
  const b = JSON.parse(await r.text()) as { open_24?: string; high?: string; low?: string; volume?: string };
  const [open, high, low] = [displayE8(b.open_24), displayE8(b.high), displayE8(b.low)];
  if (!open || !high || !low) return null;
  return { openE8: open.toString(), highE8: high.toString(), lowE8: low.toString(), volume: b.volume ?? null, basis: "24h", source: "bitstamp" };
}
