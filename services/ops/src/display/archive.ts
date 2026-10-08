/**
 * The display feed's fallback history (S23a): RedStone's signed values as `price_ticks` keeps them (every 10 s, 30
 * days), folded into candles and 24 h figures for a ticker the fast sources can't serve — a stock with no Alpaca keys,
 * an exchange outage, a crypto symbol Coinbase refused. Real values, labelled `redstone` on the wire; never guessed.
 * A stock reads its 24/7 feed (`<T>-24`), one continuous series through every session; PLTR and AMD, which have none,
 * read their regular feed.
 */
import { TICKERS, type TickerSymbol } from "@cwf/core";
import type { Sql } from "@cwf/db";
import type { Candle, DayStats } from "./alpaca-bars";

/** The `price_ticks` key whose history draws a ticker's chart; null where RedStone has no feed (SPCX). */
export function archiveKeyOf(symbol: TickerSymbol): string | null {
  const t = TICKERS[symbol];
  return t.redstone24x7FeedId ? `${symbol}-24` : t.redstoneFeedId ? symbol : null;
}

const e8 = (text: string) => Number(BigInt(text)) / 1e8;

/** Up to `count` candles of `intervalSec` ending at `endMs`, oldest first, from the signed archive. */
export async function archiveCandles(sql: Sql, symbol: TickerSymbol, intervalSec: number, count: number, endMs: number): Promise<Candle[]> {
  const key = archiveKeyOf(symbol);
  if (!key) return [];
  const toSec = Math.floor(endMs / 1000);
  const fromSec = toSec - count * intervalSec;
  const rows = await sql<{ b: string; o: string; h: string; l: string; c: string }[]>`
    select (publish_sec / ${intervalSec}::bigint) * ${intervalSec}::bigint as b,
      (array_agg(price_e8 order by publish_sec))[1]::text as o, max(price_e8)::text as h, min(price_e8)::text as l,
      (array_agg(price_e8 order by publish_sec desc))[1]::text as c
    from price_ticks where symbol = ${key} and publish_sec > ${fromSec} and publish_sec <= ${toSec}
    group by 1 order by 1`;
  return rows.map((r) => [Number(r.b) * 1000, e8(r.o), e8(r.h), e8(r.l), e8(r.c)]);
}

/** Last-24 h open/high/low per ticker from the signed archive, for the tickers the fast sources missed. */
export async function archiveDay(sql: Sql, symbols: readonly TickerSymbol[], nowSec = Math.floor(Date.now() / 1000)): Promise<Record<string, DayStats>> {
  const byKey = new Map(symbols.flatMap((s) => (archiveKeyOf(s) ? [[archiveKeyOf(s)!, s] as const] : [])));
  if (byKey.size === 0) return {};
  const rows = await sql<{ symbol: string; o: string; h: string; l: string }[]>`
    select symbol, (array_agg(price_e8 order by publish_sec))[1]::text as o, max(price_e8)::text as h, min(price_e8)::text as l
    from price_ticks where symbol in ${sql([...byKey.keys()])} and publish_sec >= ${nowSec - 86_400}
    group by symbol`;
  const out: Record<string, DayStats> = {};
  for (const r of rows) {
    const symbol = byKey.get(r.symbol);
    if (symbol) out[symbol] = { openE8: r.o, highE8: r.h, lowE8: r.l, volume: null, basis: "24h", source: "redstone" };
  }
  return out;
}
