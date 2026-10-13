"use client";

// The hall's achievements shelf (R4-9, D-227; ported from Owarine 90a91d71:web/src/features/games/AchievementsPlate.tsx):
// what this wallet has earned and what the rest take — a locked badge names its goal rather than hiding. Every badge
// follows from a record that already exists (a replayed run, a settled Lucky draw). Signed out, the goals still show.
import { useQuery } from "@tanstack/react-query";
import { useWalletSession } from "@/lib/wallet-session";
import type { AchievementsWire } from "../achievements.server";
import { GAMES } from "../copy";

export function AchievementsShelf() {
  const { address } = useWalletSession();
  const q = useQuery({
    queryKey: ["games", "achievements", address],
    queryFn: async () => {
      const res = await fetch(`/api/games/achievements${address ? `?wallet=${address}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as AchievementsWire;
    },
    retry: 1,
  });
  const shelf = q.data;
  if (!shelf || !shelf.configured || shelf.achievements.length === 0) return null;
  return (
    <section className="ach" aria-label={GAMES.achievements.title}>
      <div className="ach-head">
        <h2 className="ach-title">{GAMES.achievements.title}</h2>
        <span className="ach-count">{address ? GAMES.achievements.count(shelf.earned, shelf.achievements.length) : GAMES.achievements.signedOut}</span>
      </div>
      <ul className="ach-list">
        {shelf.achievements.map((badge) => (
          <li key={badge.id} className="ach-badge" data-on={badge.earned || undefined}>
            <span className="ach-name">{badge.title}</span>
            <span className="ach-how">{badge.how}</span>
            {badge.need > 1 && !badge.earned ? (
              <span className="ach-progress">
                {badge.have} / {badge.need}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
