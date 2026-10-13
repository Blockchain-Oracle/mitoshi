"use client";

// /games/rank (R4-9, D-227; Owarine 90a91d71 app/games/rank → DuelRank's place, built now on the records that exist):
// TextTabs (Ported from Owarine 90a91d71:web/src/components/kit/TextTabs.tsx, R4-2) over Line Rider and Candle Hop —
// the replayed-run boards, 50 deep — and Streaks, the venue's best runs of settled wins (`/api/leaderboard?sort=streak`).
// Each on the owner-approved LeaderboardPodium and LeaderboardRankings with the marble AccountAvatar. A Duel tab joins
// when the arena lands. Lucky's streak ladder is its own tab.
import { useState } from "react";
import { TextTabs } from "@/components/kit";
import { LeaderboardPodium, type PodiumPlace } from "@/components/ui/leaderboard-podium";
import { LeaderboardRankings, type RankingRow } from "@/components/ui/leaderboard-rankings";
import { useLeaderboard } from "@/features/leaderboard/useLeaderboard";
import { useWalletSession } from "@/lib/wallet-session";
import { ARCADE } from "../arcade/copy";
import { GAMES } from "../copy";
import { useBoard } from "../hall/data";
import { useQuery } from "@tanstack/react-query";
import type { LuckyBoardWire } from "../lucky/lucky-wire";
import "./rank.css";

type Tab = "line-rider" | "candle-hop" | "streaks" | "lucky";
const TABS = (Object.keys(GAMES.rank.tabs) as Tab[]).map((value) => ({ value, label: GAMES.rank.tabs[value] }));
const RANK_LIMIT = 50;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Board({ places, rows, you, youOwner, label }: { places: PodiumPlace[]; rows: RankingRow[]; you: RankingRow | null; youOwner: string | null; label: string }) {
  return (
    <div className="rk-board">
      <LeaderboardPodium places={places} label={label} />
      {rows.length > 3 || you ? <LeaderboardRankings rows={rows.slice(3)} you={you} youOwner={youOwner} label={label} youLabel={GAMES.rank.you} /> : null}
    </div>
  );
}

function ArcadeBoard({ game, address }: { game: "line-rider" | "candle-hop"; address: string | null }) {
  const board = useBoard(game, address, RANK_LIMIT);
  if (board === undefined) return <p className="rk-note">{GAMES.rank.loading}</p>;
  if (board === null) return <p className="rk-note">{GAMES.rank.offline}</p>;
  if (!board.configured) return <p className="rk-note">{GAMES.rank.noStore}</p>;
  if (board.rows.length === 0) return <p className="rk-note">{GAMES.rank.empty}</p>;
  const me = address?.toLowerCase() ?? null;
  const rows: RankingRow[] = board.rows.map((r, i) => ({
    rank: i + 1,
    owner: r.wallet,
    label: short(r.wallet),
    byline: [new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }), r.calm ? GAMES.rank.calm : null].filter(Boolean).join(" · "),
    figure: ARCADE.fmt(r.score),
    tone: "flat",
    href: `/u/${r.wallet}`,
  }));
  const places: PodiumPlace[] = rows.slice(0, 3).map((r) => ({ rank: r.rank, owner: r.owner, label: r.label, figure: r.figure, tone: "flat", href: r.href }));
  const inTop = me !== null && rows.some((r) => r.owner === me);
  const you: RankingRow | null =
    board.me && me && !inTop ? { rank: board.me.rank, owner: me, label: short(me), byline: GAMES.rank.you, figure: ARCADE.fmt(board.me.best), tone: "flat", href: `/u/${me}` } : null;
  return <Board places={places} rows={rows} you={you} youOwner={me} label={ARCADE.games[game].title} />;
}

function StreakBoard({ address }: { address: string | null }) {
  const board = useLeaderboard("all", "streak", address);
  if (board.isLoading) return <p className="rk-note">{GAMES.rank.loading}</p>;
  if (board.isError || !board.data) return <p className="rk-note">{GAMES.rank.offline}</p>;
  if (board.data.rankings.length === 0) return <p className="rk-note">{GAMES.rank.streakEmpty}</p>;
  const me = address?.toLowerCase() ?? null;
  const toRow = (r: (typeof board.data.rankings)[number]): RankingRow => ({
    rank: r.rank,
    owner: r.owner,
    label: short(r.owner),
    byline: GAMES.streak.winRate(r.winRatePct.toFixed(0)),
    figure: GAMES.rank.streakValue(r.bestStreak),
    tone: "up",
    href: `/u/${r.owner}`,
  });
  const rows = board.data.rankings.map(toRow);
  const places: PodiumPlace[] = rows.slice(0, 3).map((r) => ({ rank: r.rank, owner: r.owner, label: r.label, figure: r.figure, tone: r.tone, href: r.href }));
  return <Board places={places} rows={rows} you={board.data.you ? toRow(board.data.you) : null} youOwner={me} label={GAMES.rank.tabs.streaks} />;
}

/** Lucky's ladder: current streaks of settled wins, the best as the tiebreak (`/api/games/lucky/board`). */
function LuckyBoard({ address }: { address: string | null }) {
  const q = useQuery({
    queryKey: ["games", "lucky", "board"],
    queryFn: async () => {
      const res = await fetch("/api/games/lucky/board");
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as LuckyBoardWire;
    },
    retry: 1,
  });
  if (q.isLoading) return <p className="rk-note">{GAMES.rank.loading}</p>;
  if (q.isError || !q.data) return <p className="rk-note">{GAMES.rank.offline}</p>;
  if (!q.data.configured) return <p className="rk-note">{GAMES.rank.noStore}</p>;
  if (q.data.rows.length === 0) return <p className="rk-note">{GAMES.rank.streakEmpty}</p>;
  const me = address?.toLowerCase() ?? null;
  const rows: RankingRow[] = q.data.rows.map((r, i) => ({ rank: i + 1, owner: r.wallet, label: short(r.wallet), byline: GAMES.rank.luckyBest(r.best, r.draws), figure: GAMES.rank.streakValue(r.streak), tone: "up", href: `/u/${r.wallet}` }));
  const places: PodiumPlace[] = rows.slice(0, 3).map((r) => ({ rank: r.rank, owner: r.owner, label: r.label, figure: r.figure, tone: r.tone, href: r.href }));
  return <Board places={places} rows={rows} you={null} youOwner={me} label={GAMES.rank.tabs.lucky} />;
}

export function GamesRank() {
  const [tab, setTab] = useState<Tab>("line-rider");
  const { address } = useWalletSession();
  return (
    <div className="gm-page rk">
      <TextTabs value={tab} onChange={setTab} tabs={TABS} label={GAMES.rank.title} />
      {tab === "streaks" ? <StreakBoard address={address} /> : tab === "lucky" ? <LuckyBoard address={address} /> : <ArcadeBoard game={tab} address={address} />}
    </div>
  );
}
