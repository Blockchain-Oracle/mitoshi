"use client";

// Your duels on the History page (R4-9, D-227; Owarine 90a91d71:web/src/features/games/duel/DuelHistory.tsx's role):
// every duel you were paired into, newest first, with the arena's last word on it; each opens its own page.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { GAMES } from "../copy";
import { DUEL } from "./copy";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const short = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export function DuelHistory({ address }: { address: string }) {
  const q = useQuery({
    queryKey: ["games", "duel", "history", address],
    queryFn: async () => {
      const res = await fetch(`/api/games/duel/history?address=${address}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { configured: boolean; rows: { matchId: string; tier: string; status: string; opponent: string; createdAt: string }[] };
    },
    retry: 1,
  });
  if (q.data && !q.data.configured) return null;
  return (
    <section className="rk-section" aria-label={GAMES.history.duelTitle}>
      <h2 className="rk-section-title">{GAMES.history.duelTitle}</h2>
      {q.isLoading ? (
        <p className="rk-note">{GAMES.history.loading}</p>
      ) : q.isError || !q.data ? (
        <p className="rk-note">{GAMES.history.offline}</p>
      ) : q.data.rows.length === 0 ? (
        <p className="rk-note">{GAMES.history.duelEmpty}</p>
      ) : (
        <ol className="rk-list">
          {q.data.rows.map((r) => (
            <li key={r.matchId} className="rk-row">
              <Link href={`/games/duel/${r.matchId}`} className="rk-row-main">
                <span className="rk-row-title">{`${DUEL.lobby.vs.toLowerCase()} ${short(r.opponent)}`}</span>
                <span className="rk-row-sub">{when(r.createdAt)}</span>
              </Link>
              <span className="rk-row-side">
                <span className="rk-row-figure">{DUEL.entry.tierWord(r.tier, Number(r.tier.slice(1)) || 0)}</span>
                <span className="rk-row-sub">{DUEL.result.title(r.status)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
