// Ported from Owarine ecb7565b:services/ops/src/prices/chart-candles.ts — Coinbase then Bitstamp for BTC, ETH and SOL
// (no Bybit: Mitoshi lists no Canton Coin), Alpaca for the stocks, and the signed archive (`archive.ts`) wherever those
// can't answer, with the source on the wire.
/**
 * Chart candles for the terminal's candle view (S23a; Tradash's `fetchCandles`: 1m…1d, 300 a read): Coinbase Exchange
 * `/products/<S>-USD/candles` for crypto, which serves 1m/5m/15m/1h/6h/1d — 3m, 30m, 2h, 4h and 12h are folded from
 * the next finer one; Coinbase failing, Bitstamp's OHLC (`bitstamp.ts`). Stocks read Alpaca's bars when ops holds Alpaca
 * keys. Every fast source failing, or no keys, falls back to RedStone's archive. Display only, cached 10 s per (symbol, interval, count, end). SPCX without Alpaca answers
 * `unavailable` so the screen says so rather than drawing nothing.
 *
 * Wire: `{ symbol, interval, source, candles: [[tMs, open, high, low, close], …] }`, oldest first, prices as numbers.
 */
import { isTickerSymbol, TICKERS, type CryptoSymbol, type TickerSymbol } from "@cwf/core";
import type { Sql } from "@cwf/db";
import { alpacaCandles, alpacaSymbolOf, type Candle } from "./alpaca-bars";
import type { AlpacaKeys } from "./alpaca-trades";
import { archiveCandles, archiveKeyOf } from "./archive";
import { bitstampCandles } from "./bitstamp";
import type { Fetch } from "./types";

export const CANDLE_INTERVALS = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "12h", "1d"] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];
export const INTERVAL_SEC: Record<CandleInterval, number> = { "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "2h": 7200, "4h": 14_400, "12h": 43_200, "1d": 86_400 };
/** What each interval is read at on Coinbase (its granularities) before aggregation. */
const SOURCE_SEC: Record<CandleInterval, number> = { "1m": 60, "3m": 60, "5m": 300, "15m": 900, "30m": 300, "1h": 3600, "2h": 3600, "4h": 3600, "12h": 21_600, "1d": 86_400 };
const PER_READ = 300;
const MAX_COUNT = 300;
const CACHE_MS = 10_000;

export type CandleSource = "coinbase" | "bitstamp" | "alpaca" | "redstone";

/** Coinbase rows `[time, low, high, open, close, volume]` (newest first) → ascending `[tMs, o, h, l, c]`. */
export function parseCoinbaseCandles(text: string): Candle[] {
  const rows = JSON.parse(text) as unknown;
  if (!Array.isArray(rows)) throw new Error(`coinbase candles: ${text.slice(0, 120)}`);
  return (rows as unknown[][])
    .filter((r) => Array.isArray(r) && r.length >= 5 && r.slice(0, 5).every((v) => typeof v === "number"))
    .map((r) => [(r[0] as number) * 1000, r[3] as number, r[2] as number, r[1] as number, r[4] as number] as Candle)
    .sort((a, b) => a[0] - b[0]);
}

/** Folds ascending finer candles into buckets of `sec` aligned to the epoch; partial buckets kept. */
export function aggregate(rows: readonly Candle[], sec: number): Candle[] {
  const out: Candle[] = [];
  const ms = sec * 1000;
  for (const [t, o, h, l, c] of rows) {
    const b = Math.floor(t / ms) * ms;
    const last = out.at(-1);
    if (last && last[0] === b) {
      last[2] = Math.max(last[2], h);
      last[3] = Math.min(last[3], l);
      last[4] = c;
    } else out.push([b, o, h, l, c]);
  }
  return out;
}

export type ChartCandles = (input: { symbol: string; interval: string; count?: number; endMs?: number }) => Promise<{ status: number; body: unknown }>;

export function createChartCandles(input: { fetchImpl?: Fetch; alpaca?: AlpacaKeys | null; sql?: Sql | null } = {}): ChartCandles {
  const fetchImpl = input.fetchImpl ?? (fetch as Fetch);
  const alpaca = input.alpaca ?? null;
  const sql = input.sql ?? null;
  const cache = new Map<string, { atMs: number; body: Promise<{ source: CandleSource; candles: Candle[] }> }>();

  const coinbase = async (symbol: string, interval: CandleInterval, count: number, endMs: number): Promise<Candle[]> => {
    const src = SOURCE_SEC[interval];
    const want = Math.ceil((count * INTERVAL_SEC[interval]) / src);
    const rows: Candle[] = [];
    let end = Math.floor(endMs / 1000);
    while (rows.length < want) {
      const n = Math.min(PER_READ, want - rows.length);
      const start = end - n * src;
      const url = `https://api.exchange.coinbase.com/products/${symbol}-USD/candles?granularity=${src}&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`;
      const r = await fetchImpl(url, { headers: { "user-agent": "mitoshi-chart-candles" }, signal: AbortSignal.timeout(6_000) });
      if (!r.ok) throw new Error(`coinbase candles HTTP ${r.status}`);
      const page = parseCoinbaseCandles(await r.text());
      if (page.length === 0) break;
      rows.unshift(...page.filter((c) => !rows.length || c[0] < rows[0]![0]));
      end = start;
    }
    const out = src === INTERVAL_SEC[interval] ? rows : aggregate(rows, INTERVAL_SEC[interval]);
    return out.slice(-count);
  };

  const read = async (symbol: TickerSymbol, interval: CandleInterval, count: number, endMs: number): Promise<{ source: CandleSource; candles: Candle[] }> => {
    const archive = async (why: unknown): Promise<{ source: CandleSource; candles: Candle[] }> => {
      if (!sql || !archiveKeyOf(symbol)) throw why instanceof Error ? why : new Error(String(why));
      return { source: "redstone", candles: await archiveCandles(sql, symbol, INTERVAL_SEC[interval], count, endMs) };
    };
    if (TICKERS[symbol].kind === "crypto") {
      return coinbase(symbol, interval, count, endMs).then(
        (candles) => ({ source: "coinbase" as const, candles }),
        () => bitstampCandles(fetchImpl, symbol as CryptoSymbol, INTERVAL_SEC[interval], count, endMs).then((candles) => ({ source: "bitstamp" as const, candles }), archive),
      );
    }
    if (alpaca && alpacaSymbolOf(symbol)) return alpacaCandles(fetchImpl, alpaca, symbol, interval, INTERVAL_SEC[interval], count, endMs).then((candles) => ({ source: "alpaca" as const, candles }), archive);
    return archive(new Error(`no candle source for ${symbol}`));
  };

  return async (q) => {
    const interval = q.interval as CandleInterval;
    if (!(CANDLE_INTERVALS as readonly string[]).includes(interval)) return { status: 400, body: { error: `interval must be one of ${CANDLE_INTERVALS.join(", ")}` } };
    if (!isTickerSymbol(q.symbol)) return { status: 404, body: { error: "unavailable", reason: `${q.symbol} is not listed` } };
    const symbol = q.symbol;
    const servable = TICKERS[symbol].kind === "crypto" || (alpaca !== null && alpacaSymbolOf(symbol) !== null) || (sql !== null && archiveKeyOf(symbol) !== null);
    if (!servable) return { status: 404, body: { error: "unavailable", reason: `Candles for ${symbol} are not available yet` } };
    const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(q.count ?? MAX_COUNT)));
    const endMs = q.endMs && Number.isFinite(q.endMs) ? q.endMs : Date.now();
    const key = `${symbol}:${interval}:${count}:${Math.floor(endMs / CACHE_MS)}`;
    let hit = cache.get(key);
    if (!hit || Date.now() - hit.atMs > CACHE_MS) {
      hit = { atMs: Date.now(), body: read(symbol, interval, count, endMs) };
      cache.set(key, hit);
      if (cache.size > 200) cache.delete(cache.keys().next().value!);
    }
    try {
      const { source, candles } = await hit.body;
      return { status: 200, body: { symbol, interval, source, candles } };
    } catch (error) {
      cache.delete(key);
      return { status: 503, body: { error: error instanceof Error ? error.message : String(error) } };
    }
  };
}
