"use client";
// Which Windows' own prices are fresh right now (R6 games §4.3.4): the price-late block offers "Try X →" only to a
// Window whose feed ticked inside `PRICE_STALE_AFTER_MS`, so it never names one that will also wait. Reads the stream's
// ticks already in the cache (`keys.price`, stream-owned, never fetched) — no request.
import type { EventMarket } from "@cwf/core";
import { PRICE_STALE_AFTER_MS } from "@cwf/core/constants";
import { keys } from "@cwf/markets/react";
import { useQueries } from "@tanstack/react-query";
import { feedKeyOf } from "../markets/units";

const never = () => new Promise<never>(() => undefined);

export function useFreshness(markets: readonly EventMarket[], nowMs: number): (m: EventMarket) => boolean {
  const feeds = [...new Set(markets.map(feedKeyOf))];
  const ticks = useQueries({ queries: feeds.map((feed) => ({ queryKey: keys.price(feed), queryFn: never, enabled: false, staleTime: Infinity })) });
  const fresh = new Set(
    feeds.filter((_, i) => {
      const tick = ticks[i]?.data as { publishTimeSec: number } | undefined;
      return tick !== undefined && nowMs > 0 && nowMs - tick.publishTimeSec * 1000 <= PRICE_STALE_AFTER_MS;
    }),
  );
  return (m) => fresh.has(feedKeyOf(m));
}
