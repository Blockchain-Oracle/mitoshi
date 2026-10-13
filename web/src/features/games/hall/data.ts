"use client";

import { useQuery } from "@tanstack/react-query";
import type { BoardWire } from "../arcade/wire";

/**
 * The hall's public reads (R4-9, D-227) — every number on the hub is a real record: the crowd's lean (`/api/sentiment`),
 * the venue's last ten minutes of fills (`/api/index/tape`), the arcade's newest replayed runs and boards. A read that
 * fails reads as absent (the element hides), never as a made-up figure.
 */
async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

export interface CrowdWire {
  symbol: string;
  upBps: number | null;
  window: string | null;
}

/** UP's share of the crowd's lots on a ticker, as a whole percent; null when there is no reading. */
export function useCrowdPct(symbol: string | null): number | null {
  const q = useQuery({ queryKey: ["games", "crowd", symbol], queryFn: () => json<CrowdWire>(`/api/sentiment?symbol=${encodeURIComponent(symbol!)}`), enabled: symbol !== null, staleTime: 60_000, retry: 1 });
  const bps = q.data?.upBps;
  return bps === null || bps === undefined ? null : Math.round(bps / 100);
}

export interface TapeFill {
  taker: string;
  takerKind: number;
  symbol: string | null;
  cadenceSec: number | null;
  tsSec: number;
}

/** The venue's fills since `sinceSec`, newest first: who took which side of which Window. */
export function useTape(sinceSec: number): TapeFill[] {
  const q = useQuery({
    queryKey: ["games", "tape", sinceSec],
    queryFn: () => json<{ rows: Record<string, unknown>[] }>(`/api/index/tape?since=${sinceSec}&limit=30`),
    enabled: sinceSec > 0,
    refetchInterval: 15_000,
    retry: 1,
  });
  return (q.data?.rows ?? []).map((r) => ({
    taker: String(r.taker ?? ""),
    takerKind: Number(r.taker_kind),
    symbol: r.symbol === null || r.symbol === undefined ? null : String(r.symbol),
    cadenceSec: r.cadence_sec === null || r.cadence_sec === undefined ? null : Number(r.cadence_sec),
    tsSec: Number(r.ts_sec),
  }));
}

/** A taker leans UP buying YES or selling NO (kinds 0, 3), DOWN selling YES or buying NO (1, 2) — `@cwf/db/idx` crowd. */
export const takerLeansUp = (kind: number): boolean => kind === 0 || kind === 3;

export interface RecentRunWire {
  game: "line-rider" | "candle-hop";
  wallet: string;
  score: number;
  at: string;
  best?: boolean;
}

export function useRecentRuns(): RecentRunWire[] {
  const q = useQuery({ queryKey: ["games", "arcade", "recent"], queryFn: () => json<{ rows: RecentRunWire[] }>("/api/games/arcade/recent"), refetchInterval: 30_000, retry: 1 });
  return q.data?.rows ?? [];
}

/** One arcade board with the caller's best; `undefined` while reading, `null` when it did not answer. */
export function useBoard(game: "line-rider" | "candle-hop", address: string | null, limit?: number): BoardWire | null | undefined {
  const q = useQuery({
    queryKey: ["games", "arcade", "board", game, address, limit ?? 10],
    queryFn: () => json<BoardWire>(`/api/games/arcade/board?game=${game}${address ? `&address=${address}` : ""}${limit ? `&limit=${limit}` : ""}`),
    staleTime: 30_000,
    retry: 1,
  });
  return q.isError ? null : q.data;
}

export const shortHex = (address: string): string => (address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-2)}` : address);

/** A real-price tape for the attract loops (`/api/games/arcade/tape`); null until it answers or when it has none. */
export function usePreviewTape(): readonly number[] | null {
  const q = useQuery({ queryKey: ["games", "arcade", "tape"], queryFn: () => json<{ points: number[] }>("/api/games/arcade/tape"), staleTime: 300_000, retry: 1 });
  const points = q.data?.points;
  return points && points.length > 1 ? points : null;
}
