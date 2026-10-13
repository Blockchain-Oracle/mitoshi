"use client";

// /games/history (R4-9, D-227; Owarine 90a91d71 app/games/history = DuelHistory + LuckyHistory, each from its own record):
// your replayed arcade runs, newest first — game, score, where it ranks on its board now, the seed it was drawn from and
// when — from `GET /api/games/arcade/runs`; then your Lucky draws (`/api/games/lucky/history`). Duels join with the
// arena. Signed out it is one line that opens sign-in.
import { useQuery } from "@tanstack/react-query";
import { useWalletSession } from "@/lib/wallet-session";
import { ARCADE } from "../arcade/copy";
import { GAMES } from "../copy";
import { LuckyHistory } from "../lucky/LuckyHistory";
import { DuelHistory } from "../duel/DuelHistory";
import "../rank/rank.css";

interface RunWire {
  game: "line-rider" | "candle-hop";
  score: number;
  seed: string | null;
  calm: boolean;
  at: string;
  rank: number | null;
}

function useRuns(address: string | null) {
  return useQuery({
    queryKey: ["games", "arcade", "runs", address],
    queryFn: async () => {
      const res = await fetch(`/api/games/arcade/runs?address=${address}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { configured: boolean; rows: RunWire[] };
    },
    enabled: address !== null,
    retry: 1,
  });
}

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function GamesHistory() {
  const { address, connect } = useWalletSession();
  const runs = useRuns(address);

  if (!address) {
    return (
      <div className="gm-page rk">
        <button type="button" className="rk-signin" onClick={connect}>
          {GAMES.history.signedOut}
        </button>
      </div>
    );
  }

  return (
    <div className="gm-page rk">
      <section className="rk-section" aria-label={GAMES.history.title}>
        {runs.isLoading ? (
          <p className="rk-note">{GAMES.history.loading}</p>
        ) : runs.isError || !runs.data ? (
          <p className="rk-note">{GAMES.history.offline}</p>
        ) : !runs.data.configured ? (
          <p className="rk-note">{GAMES.history.noStore}</p>
        ) : runs.data.rows.length === 0 ? (
          <p className="rk-note">{GAMES.history.empty}</p>
        ) : (
          <ol className="rk-list">
            {runs.data.rows.map((r) => (
              <li key={`${r.game}-${r.at}`} className="rk-row">
                <span className="rk-row-main">
                  <span className="rk-row-title">{ARCADE.games[r.game].title}</span>
                  <span className="rk-row-sub">{[when(r.at), r.seed ? ARCADE.over.seed(r.seed) : null, r.calm ? GAMES.history.calm : null].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="rk-row-side">
                  <span className="rk-row-figure">{ARCADE.fmt(r.score)}</span>
                  {r.rank !== null ? <span className="rk-row-sub">{GAMES.history.rank(r.rank)}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <DuelHistory address={address} />
      <LuckyHistory address={address} />
    </div>
  );
}
