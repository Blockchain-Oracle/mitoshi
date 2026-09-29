"use client";
/**
 * One Window's price series (Ported from Masayume 68f7a09:web/src/features/markets/hero/useChartSeries.ts): history
 * from a minute before the Window opened (ops `/prices/history`), then every live tick appended from the one stream
 * (`keys.price`, D-049) — the same signed feed the Window settles on, so the chart and the line never disagree.
 */
import type { EventMarket, Reading } from "@cwf/core";
import { mapReading } from "@cwf/core";
import { usePrice, usePriceHistory } from "@cwf/markets/react";
import { useEffect, useMemo, useState } from "react";
import { feedKeyOf } from "../units";

const HISTORY_LEAD_SEC = 60;

export interface ChartPoint {
  timeSec: number;
  valueRaw: bigint;
}

export interface ChartSeries {
  points: ChartPoint[];
  latest: ChartPoint | null;
}

/** lightweight-charts needs strictly ascending, unique times; the last sample in a second wins. */
export function dedupeByTime(points: readonly ChartPoint[]): ChartPoint[] {
  const byTime = new Map<number, ChartPoint>();
  for (const p of points) byTime.set(p.timeSec, p);
  return [...byTime.values()].sort((a, b) => a.timeSec - b.timeSec);
}

export function useChartSeries(market: Pick<EventMarket, "marketId" | "asset" | "lane" | "tradingStartSec" | "expirySec"> | null): Reading<ChartSeries> | null {
  const key = market ? feedKeyOf(market) : null;
  const fromSec = (market?.tradingStartSec ?? 0) - HISTORY_LEAD_SEC;
  const history = usePriceHistory(key, fromSec, market?.expirySec ?? 0);
  const tick = usePrice(key ?? "");
  const [ticks, setTicks] = useState<ChartPoint[]>([]);

  useEffect(() => setTicks([]), [market?.marketId]);
  useEffect(() => {
    if (!tick) return;
    const point = { timeSec: tick.publishTimeSec, valueRaw: BigInt(tick.priceE8) };
    setTicks((prev) => {
      const last = prev.at(-1);
      return !last || point.timeSec > last.timeSec ? [...prev.slice(-600), point] : prev;
    });
  }, [tick]);

  return useMemo(() => {
    if (history === null) return null;
    return mapReading(history, (rows) => {
      const all = dedupeByTime([...rows.map((r) => ({ timeSec: r.blockTimestampSec, valueRaw: r.priceRaw })), ...ticks]).filter((p) => p.timeSec >= fromSec);
      return { points: all, latest: all.at(-1) ?? null };
    });
  }, [history, ticks, fromSec]);
}

/** The live price alone (a card's figure, the question's distance): the stream's tick, or the series' last point. */
export function useSpot(market: Pick<EventMarket, "asset" | "lane"> | null): bigint | null {
  const tick = usePrice(market ? feedKeyOf(market) : "");
  return tick ? BigInt(tick.priceE8) : null;
}
