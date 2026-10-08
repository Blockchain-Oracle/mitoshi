"use client";
/**
 * The markets picker's day figures (S23g; ops `/prices/day`, D-196): per ticker the change's reference (a stock's
 * previous close, a crypto's price 24 h ago), high, low, and which source answered — Coinbase, Bitstamp, Alpaca or
 * RedStone's archive. Read once a minute while the picker is open; a ticker no source answered for is absent.
 */
import { useQuery } from "@tanstack/react-query";
import { webEnv } from "@/lib/env";

export interface DayFigures {
  openE8: string;
  highE8: string;
  lowE8: string;
  volume: string | null;
  basis: "prev-close" | "24h";
  source: string;
}

export function useDayStats(enabled: boolean): Record<string, DayFigures> | null {
  const base = webEnv.markets.opsUrl?.replace(/\/+$/, "") ?? null;
  const q = useQuery({
    queryKey: ["cwf", "terminal", "day-stats"],
    queryFn: async () => {
      const res = await fetch(`${base}/prices/day`, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`day stats ${res.status}`);
      return (await res.json()) as Record<string, DayFigures>;
    },
    enabled: enabled && base !== null,
    staleTime: 60_000,
    refetchInterval: enabled ? 60_000 : false,
  });
  return q.data ?? null;
}

/** The day's change as a fraction, from the live price and the reference; null without either. */
export function dayChange(price: number | null, day: DayFigures | undefined): number | null {
  if (price === null || !day) return null;
  const ref = Number(BigInt(day.openE8)) / 1e8;
  return ref > 0 ? price / ref - 1 : null;
}
