// Your duels (R4-9, D-227; Owarine 90a91d71:web/src/features/games/duel/DuelHistory.tsx's role): every duel you were
// paired into, newest first, with the arena's last word on it — read for History's "Duels" (history/HistoryParts).
import { useQuery } from "@tanstack/react-query";
import type { DuelHistoryRowWire } from "../history/HistoryParts";

export function useDuelHistory(address: string | null) {
  return useQuery({
    queryKey: ["games", "duel", "history", address],
    queryFn: async () => {
      const res = await fetch(`/api/games/duel/history?address=${address}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { configured: boolean; rows: DuelHistoryRowWire[] };
    },
    enabled: address !== null,
    retry: 1,
  });
}
