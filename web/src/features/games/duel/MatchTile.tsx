"use client";

// The hall's live duel (R4-9, D-227; Ported from Owarine 90a91d71:web/src/features/games/MatchTile.tsx): a duel you are
// paired into that is still live — opening, picking or settling — one tap from where you left it. Signed out or idle,
// nothing. The presence hook is the cabinet's live fact: who waits at a pot right now.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useWalletSession } from "@/lib/wallet-session";
import { DUEL } from "./copy";
import type { DuelQueueWire } from "./duel-wire";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function useDuelPresence() {
  return useQuery({
    queryKey: ["games", "duel", "presence"],
    queryFn: async () => {
      const res = await fetch("/api/games/duel/presence", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { configured: boolean; waiting: Record<string, number> };
    },
    refetchInterval: 10_000,
    retry: 1,
  });
}

export function MatchTile() {
  const { address } = useWalletSession();
  const q = useQuery({
    queryKey: ["games", "duel", "queue", address],
    queryFn: async () => (await (await fetch("/api/games/duel/queue", { cache: "no-store", credentials: "same-origin" })).json()) as DuelQueueWire,
    enabled: address !== null,
  });
  if (!q.data || q.data.status !== "paired") return null;
  const opponent = q.data.role === "creator" ? q.data.challenger : q.data.creator;
  return (
    <Link href="/games/duel" className="du-tile">
      <span className="du-tile-dot" aria-hidden />
      <span className="du-tile-main">
        <span className="du-tile-title">{DUEL.tile.title}</span>
        <span className="du-tile-sub">{DUEL.tile.vs(short(opponent))}</span>
      </span>
      <span className="du-tile-go">{DUEL.tile.resume}</span>
    </Link>
  );
}
