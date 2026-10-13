"use client";

// Your Lucky draws (R4-9, D-227; Owarine 90a91d71:web/src/features/games/lucky/LuckyHistory.tsx's role): every revealed
// draw, newest first, read for History's "Lucky draws" (history/HistoryParts) and the machine's streak line.
import { useQuery } from "@tanstack/react-query";
import type { LuckyHistoryWire } from "./lucky-wire";

/** A wallet's draws, reconciled against the chain on read; shared by History and the machine's streak line. */
export function useLuckyHistory(address: string | null, refetchInterval: number | false = false) {
  return useQuery({
    queryKey: ["games", "lucky", "history", address],
    queryFn: async () => {
      const res = await fetch(`/api/games/lucky/history?address=${address}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as LuckyHistoryWire;
    },
    enabled: address !== null,
    retry: 1,
    refetchInterval,
  });
}
