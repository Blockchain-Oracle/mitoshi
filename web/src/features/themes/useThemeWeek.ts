"use client";
/**
 * A theme's week (R4-11, D-227; Owarine 90a91d71 BasketCard's index box): each member's hourly candles from ops'
 * display feed (`/prices/candles`, the chart's line — a view, never a settling value, D-196), joined on the hours every
 * member traded, as the target-weighted price. Empty until every member has candles; no member is ever filled in.
 */
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { webEnv } from "@/lib/env";

type CandleRow = [number, number, number, number, number];
const HOURS = 168;

export function useThemeWeek(members: readonly { symbol: string; band: { targetBps: number } }[]): { values: number[]; moveBps: number | null } {
  const base = webEnv.markets.opsUrl?.replace(/\/+$/, "") ?? null;
  const results = useQueries({
    queries: members.map((m) => ({
      queryKey: ["cwf", "themes", "week", m.symbol],
      enabled: base !== null,
      staleTime: 10 * 60_000,
      queryFn: async (): Promise<CandleRow[]> => {
        const res = await fetch(`${base}/prices/candles?symbol=${encodeURIComponent(m.symbol)}&interval=1h&count=${HOURS}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`candles ${res.status}`);
        return ((await res.json()) as { candles: CandleRow[] }).candles;
      },
    })),
  });
  const series = results.map((r) => r.data ?? null);
  const key = series.map((s) => s?.length ?? -1).join(",");
  return useMemo(() => {
    if (members.length === 0 || series.some((s) => !s || s.length === 0)) return { values: [], moveBps: null };
    const maps = series.map((s) => new Map(s!.map((c) => [c[0], c[4]])));
    const hours = [...maps[0]!.keys()].filter((t) => maps.every((m) => m.has(t))).sort((a, b) => a - b);
    const weight = members.reduce((s, m) => s + m.band.targetBps, 0);
    const values = hours.map((t) => members.reduce((s, m, i) => s + maps[i]!.get(t)! * m.band.targetBps, 0) / weight);
    const moveBps = values.length >= 2 && values[0]! > 0 ? Math.round(((values.at(-1)! - values[0]!) / values[0]!) * 10_000) : null;
    return { values, moveBps };
    // `key` stands for the series' contents (a refetch with the same rows changes nothing).
  }, [members, key]); // eslint-disable-line react-hooks/exhaustive-deps
}
