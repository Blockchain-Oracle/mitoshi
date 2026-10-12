"use client";

import { shortHex } from "@cwf/core/units";
import type { PostState } from "./ArcadeOverlays";
import { ARCADE } from "./copy";
import type { PostAbility } from "./useArcadeScore";
import type { BoardWire } from "./wire";

/**
 * Pips's flat scoreboard: a place, a name, a score, and an arrow on your own row. Names here are
 * addresses, shortened, because the games' identity is the wallet. The head carries where the last run
 * landed; the foot carries the one line that is never allowed to fall off: what a score here is.
 */
export function ArcadeBoard({ board, you, post, ability }: { board: BoardWire | null | undefined; you: string | null; post: PostState; ability: PostAbility }) {
  const words = ARCADE.board;
  const banner = post.kind === "posted" ? (post.isBest ? ARCADE.over.newBest : ARCADE.over.ranked(post.rank)) : null;
  const rows = board?.rows ?? [];
  const mine = you ?? null;

  return (
    <div className="ar-note ar-board">
      <div className="ar-board-head">
        <span className="ar-board-title">{words.title}</span>
        {banner && <span className="ar-board-banner">{banner}</span>}
      </div>

      {board === undefined ? (
        <p className="ar-board-empty">{words.loading}</p>
      ) : board === null ? (
        <p className="ar-board-empty">{words.unreachable}</p>
      ) : !board.configured ? (
        <p className="ar-board-empty">{words.noStore}</p>
      ) : rows.length === 0 ? (
        <p className="ar-board-empty">{words.empty}</p>
      ) : (
        <ol className="ar-board-rows">
          {rows.map((row, i) => {
            const isYou = mine !== null && row.wallet === mine;
            return (
              <li key={row.wallet} className="ar-board-row" data-you={isYou || undefined}>
                <span className="ar-board-place">{i + 1}</span>
                <span className="ar-board-who">
                  {shortHex(row.wallet, 6, 4)}
                  {isYou && <span className="ar-board-tag">{words.you}</span>}
                  {row.calm && <span className="ar-board-tag">{words.calm}</span>}
                </span>
                <span className="ar-board-score">{ARCADE.fmt(row.score)}</span>
              </li>
            );
          })}
        </ol>
      )}

      {board?.me && <p className="ar-board-foot">{words.yours(ARCADE.fmt(board.me.best), board.me.rank)}</p>}
      {ability === "signedOut" && <p className="ar-board-foot">{words.connect}</p>}
      {ability === "unavailable" && board !== null && <p className="ar-board-foot">{words.unavailable}</p>}
      <p className="ar-board-foot">{ARCADE.honesty}</p>
    </div>
  );
}
