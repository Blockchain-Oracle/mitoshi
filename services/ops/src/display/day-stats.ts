// Ported from Owarine ecb7565b:services/ops/src/prices/day-stats.ts — no Bybit (no Canton Coin), Bitstamp behind Coinbase, and the signed archive
// (`archive.ts`) for any ticker Coinbase or Alpaca didn't answer, with `basis` and `source` on each row.
/**
 * Day figures per ticker for the markets picker (S23a; Tradash's "Last price / 24h change" and Hot): Coinbase Exchange
 * `/products/<S>-USD/stats` for crypto (open, high, low, volume over the last 24 h), Bitstamp's ticker when Coinbase
 * can't be reached; the stocks from Alpaca's snapshots
 * when ops holds Alpaca keys, their change quoted against the previous close; anything still missing from RedStone's
 * last 24 h in `price_ticks`. Read at most once a minute. Display only. `/prices/day` serves
 * `{ [symbol]: DayStats }`; a ticker no source answered for is absent rather than guessed.
 */
import { CRYPTO_SYMBOLS, TICKER_SYMBOLS, type TickerSymbol } from "@cwf/core";
import type { Sql } from "@cwf/db";
import { alpacaDay, alpacaSymbolOf, type DayStats } from "./alpaca-bars";
import type { AlpacaKeys } from "./alpaca-trades";
import { archiveDay } from "./archive";
import { bitstampDay } from "./bitstamp";
import { displayE8, type Fetch } from "./types";

const CACHE_MS = 60_000;
const STOCKS = TICKER_SYMBOLS.filter((s) => alpacaSymbolOf(s) !== null);

export type DayStatsReader = () => Promise<Record<string, DayStats>>;

export function createDayStats(input: { fetchImpl?: Fetch; alpaca?: AlpacaKeys | null; sql?: Sql | null } = {}): DayStatsReader {
  const fetchImpl = input.fetchImpl ?? (fetch as Fetch);
  let cached: { atMs: number; body: Promise<Record<string, DayStats>> } | null = null;
  const read = async (): Promise<Record<string, DayStats>> => {
    const out: Record<string, DayStats> = {};
    await Promise.all([
      ...CRYPTO_SYMBOLS.map(async (symbol) => {
        try {
          const r = await fetchImpl(`https://api.exchange.coinbase.com/products/${symbol}-USD/stats`, { headers: { "user-agent": "mitoshi-day-stats" }, signal: AbortSignal.timeout(5_000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const b = JSON.parse(await r.text()) as { open?: string; high?: string; low?: string; volume?: string };
          const [open, high, low] = [displayE8(b.open), displayE8(b.high), displayE8(b.low)];
          if (!open || !high || !low) throw new Error("no stats");
          out[symbol] = { openE8: open.toString(), highE8: high.toString(), lowE8: low.toString(), volume: b.volume ?? null, basis: "24h", source: "coinbase" };
        } catch {
          // Bitstamp below; then the archive.
        }
        if (!out[symbol]) {
          const day = await bitstampDay(fetchImpl, symbol).catch(() => null);
          if (day) out[symbol] = day;
        }
      }),
      input.alpaca
        ? alpacaDay(fetchImpl, input.alpaca, STOCKS).then(
            (stocks) => void Object.assign(out, stocks),
            () => undefined,
          )
        : Promise.resolve(),
    ]);
    const missing = TICKER_SYMBOLS.filter((s): s is TickerSymbol => !out[s]);
    if (missing.length && input.sql) Object.assign(out, await archiveDay(input.sql, missing).catch(() => ({})));
    return out;
  };
  return () => {
    if (!cached || Date.now() - cached.atMs > CACHE_MS) cached = { atMs: Date.now(), body: read() };
    return cached.body;
  };
}
