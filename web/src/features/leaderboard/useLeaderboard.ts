"use client";
/**
 * `/api/leaderboard` for one period and order (S5, RV-86), with the signed-in wallet's own row when it ranks below the
 * top rows. Shared by `/leaderboard` and the terminal's leaderboard drawer (S23g). The board is recomputed every few
 * minutes server-side, so a minute's staleness here costs nothing.
 */
import { useQuery } from "@tanstack/react-query";
import type { BoardPayload, BoardSort, Period } from "./protocol";

export function useLeaderboard(period: Period, sort: BoardSort, you: string | null) {
  return useQuery({
    queryKey: ["cwf", "leaderboard", period, sort, you?.toLowerCase() ?? null],
    queryFn: async (): Promise<BoardPayload> => {
      const q = new URLSearchParams({ period, sort });
      if (you) q.set("you", you);
      const response = await fetch(`/api/leaderboard?${q}`);
      if (!response.ok) throw new Error(`leaderboard ${response.status}`);
      return (await response.json()) as BoardPayload;
    },
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}
