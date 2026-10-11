"use client";
/**
 * The desk's reads (S9.7): the catalogue (a minute fresh; the stream's `strategies` topic invalidates it) and the
 * signed-in wallet's own consents and copy fills (uncached, refreshed after every write and on its `user:` topic).
 */
import { useQuery } from "@tanstack/react-query";
import type { MinePayload, StrategiesPayload } from "./protocol";

export const STRATEGIES_KEY = ["cwf", "strategies"] as const;
export const mineKey = (wallet: string | null) => ["cwf", "strategies", "mine", wallet?.toLowerCase() ?? null] as const;

export function useStrategies() {
  return useQuery({
    queryKey: STRATEGIES_KEY,
    queryFn: async (): Promise<StrategiesPayload> => {
      const res = await fetch("/api/strategies", { cache: "no-store" });
      if (!res.ok) throw new Error(`strategies ${res.status}`);
      return (await res.json()) as StrategiesPayload;
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
