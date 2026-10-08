// Ported from Owarine ecb7565b:services/ops/src/prices/recent-ring.ts — filled from the display feed (`DisplayQuote.atMs`)
// instead of the settlement spot.
/**
 * The last half hour of the display line per ticker, one sample a second (S23a): `/prices/recent?symbol=BTC` seeds the
 * terminal's chart the moment a tab opens, so the line has a past before the first streamed tick. In memory only; a
 * restart starts it empty and the chart falls back to `/prices/history` (RedStone's `price_ticks`).
 *
 * Wire: `{ symbol, points: [[timeMs, "priceE8"], …] }`, oldest first; the last sample in each second wins.
 */
import type { DisplayFeed } from "./types";

export const RECENT_SPAN_SEC = 30 * 60;

export interface RecentRing {
  points(symbol: string): Array<[number, string]>;
  stop(): void;
}

export function createRecentRing(feed: DisplayFeed, spanSec = RECENT_SPAN_SEC): RecentRing {
  const bySymbol = new Map<string, Array<[number, bigint]>>();
  const off = feed.subscribe((q) => {
    let ring = bySymbol.get(q.symbol);
    if (!ring) bySymbol.set(q.symbol, (ring = []));
    const last = ring.at(-1);
    if (last && q.atMs < last[0]) return;
    if (last && Math.floor(last[0] / 1000) === Math.floor(q.atMs / 1000)) ring[ring.length - 1] = [q.atMs, q.priceE8];
    else ring.push([q.atMs, q.priceE8]);
    const cutoff = q.atMs - spanSec * 1000;
    let drop = 0;
    while (drop < ring.length && ring[drop]![0] < cutoff) drop++;
    if (drop > 0) ring.splice(0, drop);
  });
  return {
    points: (symbol) => (bySymbol.get(symbol) ?? []).map(([t, p]) => [t, p.toString()]),
    stop: off,
  };
}
