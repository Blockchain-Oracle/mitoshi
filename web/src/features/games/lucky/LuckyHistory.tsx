"use client";

// Your Lucky draws on the History page (R4-9, D-227; Owarine 90a91d71:web/src/features/games/lucky/LuckyHistory.tsx's
// role): every revealed draw, newest first — what the reels landed on, the stake, and what the ticket lane did with it.
import { useQuery } from "@tanstack/react-query";
import { formatBaseUnits } from "@cwf/core/units";
import { SIDE_WORD } from "@/features/markets/side-styles";
import { GAMES } from "../copy";
import { LUCKY } from "./copy";
import type { LuckyHistoryWire } from "./lucky-wire";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function LuckyHistory({ address }: { address: string }) {
  const q = useQuery({
    queryKey: ["games", "lucky", "history", address],
    queryFn: async () => {
      const res = await fetch(`/api/games/lucky/history?address=${address}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as LuckyHistoryWire;
    },
    retry: 1,
  });
  if (q.data && !q.data.configured) return null;
  return (
    <section className="rk-section" aria-label={GAMES.history.luckyTitle}>
      <h2 className="rk-section-title">{GAMES.history.luckyTitle}</h2>
      {q.isLoading ? (
        <p className="rk-note">{GAMES.history.loading}</p>
      ) : q.isError || !q.data ? (
        <p className="rk-note">{GAMES.history.offline}</p>
      ) : q.data.rows.length === 0 ? (
        <p className="rk-note">{GAMES.history.luckyEmpty}</p>
      ) : (
        <ol className="rk-list">
          {q.data.rows.map((r) => (
            <li key={r.drawId} className="rk-row">
              <span className="rk-row-main">
                <span className="rk-row-title">{[r.asset, r.side ? SIDE_WORD[r.side] : null, r.multiplier ? LUCKY.reels.multiple(r.multiplier) : null].filter(Boolean).join(" · ")}</span>
                <span className="rk-row-sub">{[when(r.createdAt), r.txHash ? `${r.txHash.slice(0, 10)}…` : r.refusal].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="rk-row-side">
                <span className="rk-row-figure">${formatBaseUnits(BigInt(r.costBase ?? r.stakeBase), 6, { minDp: 0 })}</span>
                <span className="rk-row-sub">{r.result === "placed" ? LUCKY.history.placed : r.result === "refused" ? LUCKY.history.refused : r.result === "unknown" ? LUCKY.history.unknown : LUCKY.history.drawn}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
