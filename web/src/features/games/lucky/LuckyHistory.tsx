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

const RESULT_WORD: Record<string, string> = { won: LUCKY.history.won, lost: LUCKY.history.lost, void: LUCKY.history.void, "cashed-out": LUCKY.history.cashedOut, placed: LUCKY.history.placed, pending: LUCKY.history.placed, refused: LUCKY.history.refused, unknown: LUCKY.history.unknown, drawn: LUCKY.history.drawn };

export function LuckyHistory({ address }: { address: string }) {
  const q = useLuckyHistory(address);
  if (q.data && !q.data.configured) return null;
  return (
    <section className="rk-section" aria-label={GAMES.history.luckyTitle}>
      <h2 className="rk-section-title">{GAMES.history.luckyTitle}</h2>
      {q.data && q.data.best > 0 ? <p className="rk-row-sub">{LUCKY.streak(q.data.streak, q.data.best)}</p> : null}
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
                <span className="rk-row-sub" data-result={r.result}>{RESULT_WORD[r.result] ?? r.result}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
