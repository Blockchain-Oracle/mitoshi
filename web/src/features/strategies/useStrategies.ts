"use client";
/**
 * The desk's reads (S9.7): the catalogue (a minute fresh; the stream's `strategies` topic invalidates it) and the
 * signed-in wallet's own consents and copy fills (uncached, refreshed after every write and on its `user:` topic).
 */
import { useQuery } from "@tanstack/react-query";
import type { MinePayload, StrategiesPayload, StrategyWire } from "./protocol";

export const STRATEGIES_KEY = ["cwf", "strategies"] as const;
export const mineKey = (wallet: string | null) => ["cwf", "strategies", "mine", wallet?.toLowerCase() ?? null] as const;

/**
 * Strategies this tab published, as their receipts confirmed them (R4-6, automate bug 1): listed until the index has
 * them, so a catalogue read that lands before the indexer (or before the cache tag expires again) can't drop a fresh
 * publish from Yours. Each read that still misses one expires the cache tag again (the route rate-limits it).
 */
const PUBLISHED_TTL_MS = 10 * 60_000;
const published = new Map<string, { wire: StrategyWire; atMs: number }>();
export function rememberPublished(wire: StrategyWire): void {
  published.set(wire.strategyId, { wire, atMs: Date.now() });
}
function withPublished(p: StrategiesPayload): StrategiesPayload {
  const now = Date.now();
  for (const [id, entry] of published) if (now - entry.atMs > PUBLISHED_TTL_MS || p.strategies.some((s) => s.strategyId === id)) published.delete(id);
  if (published.size === 0) return p;
  void fetch("/api/strategies/revalidate", { method: "POST" }).catch(() => undefined);
  return { ...p, strategies: [...[...published.values()].map((e) => e.wire), ...p.strategies] };
}

export function useStrategies() {
  return useQuery({
    queryKey: STRATEGIES_KEY,
    queryFn: async (): Promise<StrategiesPayload> => {
      const res = await fetch("/api/strategies", { cache: "no-store" });
      if (!res.ok) throw new Error(`strategies ${res.status}`);
      return withPublished((await res.json()) as StrategiesPayload);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });
}

export function useMyStrategies(wallet: string | null) {
  return useQuery({
    queryKey: mineKey(wallet),
    enabled: wallet !== null,
    queryFn: async (): Promise<MinePayload> => {
      const res = await fetch(`/api/strategies/mine?wallet=${wallet}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`mine ${res.status}`);
      return (await res.json()) as MinePayload;
    },
    refetchInterval: 30_000,
  });
}
