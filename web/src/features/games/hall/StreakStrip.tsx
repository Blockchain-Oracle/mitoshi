"use client";

// The hall's streak strip (R4-9, D-227; it replaces GameProfileCard's three "—" stats): real records only — the trading
// streak and win rate from the leaderboard's all-time row for this wallet (`/api/leaderboard?period=all&you=`), and the
// arcade bests from each board's `me`, and the Lucky streak from the draws the chain has settled (core `luckyStreak`).
// Signed out it is one line that opens sign-in, never a wall. The flame follows
// 21st.dev 13137 trophyso/streak-badge (docs/design/components.md), on Mitoshi's tokens.
import { Flame } from "lucide-react";
import Link from "next/link";
import { useLeaderboard } from "@/features/leaderboard/useLeaderboard";
import { useWalletSession } from "@/lib/wallet-session";
import { ARCADE } from "../arcade/copy";
import { GAMES } from "../copy";
import { useLuckyHistory } from "../lucky/LuckyHistory";
import { useBoard } from "./data";

function ArcadeBest({ game, address }: { game: "line-rider" | "candle-hop"; address: string }) {
  const board = useBoard(game, address);
  if (!board?.me) return null;
  return (
    <Link href={`/games/${game}`} className="streak-chip">
      {GAMES.streak.arcadeBest(ARCADE.games[game].title, ARCADE.fmt(board.me.best))}
    </Link>
  );
}

/** Lucky's current streak beside its best, once a draw has settled. */
function LuckyBest({ address }: { address: string }) {
  const lucky = useLuckyHistory(address);
  if (!lucky.data || lucky.data.best === 0) return null;
  return (
    <Link href="/games/lucky" className="streak-chip">
      {GAMES.streak.lucky(lucky.data.streak, lucky.data.best)}
    </Link>
  );
}

export function StreakStrip() {
  const { address, connect } = useWalletSession();
  const board = useLeaderboard("all", "pnl", address);

  if (!address) {
    return (
      <button type="button" className="streak streak--out" onClick={connect}>
        <Flame aria-hidden className="streak-flame" />
        {GAMES.streak.signedOut}
      </button>
    );
  }

  const me = address.toLowerCase();
  const row = board.data ? (board.data.rankings.find((r) => r.owner.toLowerCase() === me) ?? board.data.you) : null;
  return (
    <div className="streak" aria-label={GAMES.rank.tabs.streaks}>
      <span className="streak-badge" data-on={row && row.bestStreak > 0 ? "" : undefined}>
        <Flame aria-hidden className="streak-flame" />
        <span className="streak-n">{row ? row.bestStreak : "—"}</span>
      </span>
      <span className="streak-text">
        {row ? (
          <>
            <span className="streak-main">{GAMES.streak.best(row.bestStreak)}</span>
            <span className="streak-sub">{GAMES.streak.winRate(row.winRatePct.toFixed(0))}</span>
          </>
        ) : (
          <span className="streak-sub">{board.isLoading ? "…" : GAMES.streak.noCalls}</span>
        )}
      </span>
      <span className="streak-bests">
        <ArcadeBest game="line-rider" address={address} />
        <ArcadeBest game="candle-hop" address={address} />
        <LuckyBest address={address} />
      </span>
    </div>
  );
}
