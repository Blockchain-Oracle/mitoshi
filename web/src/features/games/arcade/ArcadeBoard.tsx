"use client";

import { LeaderboardRankings, type RankingRow } from "@/components/ui/leaderboard-rankings";
import { ARCADE } from "./copy";
import type { PostAbility } from "./useArcadeScore";
import type { BoardWire } from "./wire";

/**
 * The cabinet's board (R4-9, D-227; the games spec step 6 "the board via LeaderboardRankings"): the replayed runs'
 * top ten on the owner-approved rankings with the marble avatar, your own row under them when you rank below, and the
 * one line that never falls off — what a score here is.
 */
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function ArcadeBoard({ board, you, ability }: { board: BoardWire | null | undefined; you: string | null; ability: PostAbility }) {
  const words = ARCADE.board;
  const me = you?.toLowerCase() ?? null;
  const rows: RankingRow[] = (board?.rows ?? []).map((r, i) => ({
    rank: i + 1,
    owner: r.wallet,
    label: short(r.wallet),
    byline: r.calm ? words.calm : "",
    figure: ARCADE.fmt(r.score),
    tone: "flat",
    href: `/u/${r.wallet}`,
  }));
  const inTop = me !== null && rows.some((r) => r.owner === me);
  const mine: RankingRow | null = board?.me && me && !inTop ? { rank: board.me.rank, owner: me, label: short(me), byline: words.you, figure: ARCADE.fmt(board.me.best), tone: "flat", href: `/u/${me}` } : null;

  return (
    <section className="ar-board" aria-label={words.title}>
      <span className="ar-board-title">{words.title}</span>
      {board === undefined ? (
        <p className="ar-board-empty">{words.loading}</p>
      ) : board === null ? (
        <p className="ar-board-empty">{words.unreachable}</p>
      ) : !board.configured ? (
        <p className="ar-board-empty">{words.noStore}</p>
      ) : rows.length === 0 ? (
        <p className="ar-board-empty">{words.empty}</p>
      ) : (
        <LeaderboardRankings rows={rows} you={mine} youOwner={me} label={words.title} youLabel={words.you} />
      )}
      {ability === "signedOut" ? <p className="ar-board-foot">{words.connect}</p> : null}
      <p className="ar-board-foot">{ARCADE.honesty}</p>
    </section>
  );
}
