"use client";

import type { ArcadeGame } from "@cwf/core/games/arcade";
import dynamic from "next/dynamic";
import { SHARE } from "@/features/share/copy";
import type { ShareInput } from "@/features/share/useShareCard";
import { gameEntry } from "../catalog";
import { ARCADE } from "./copy";
import type { RunEnd } from "./run";

/** The game-over Share pill loads with the game-over, not with the arcade (R4-13a: the route stays under its budget). */
const SharePill = dynamic(() => import("@/features/share/SharePill").then((m) => m.SharePill), { ssr: false, loading: () => null });

/**
 * Pips's two plates over the field, in the field's own ink: the title — the name, the pitch, the best,
 * PLAY — and the game over — the banner, the score, where it landed, PLAY AGAIN and Share (R4-13a, D-227: Ported
 * from Senryo:features/games/arcade/StageParts.tsx's OverPlate — the run as a share card, QR to the game). The board itself
 * sits beside the screen rather than on it: on a phone the screen is 219px tall and a board of six
 * rows does not fit over it, and a board a player has to scroll inside a game screen is not a board.
 */
export type PostState =
  /** Play that posts nothing: no wallet, a deployment with no store, or no room to vouch for one. Says which. */
  | { kind: "local"; why: "signedOut" | "noStore" | "unavailable" | null }
  | { kind: "checking" }
  | { kind: "posted"; rank: number; isBest: boolean }
  | { kind: "refused"; why: string };

export function TitleOverlay({ game, best, onPlay }: { game: ArcadeGame; best: number | null; onPlay: () => void }) {
  const words = ARCADE.games[game];
  return (
    <div className="ar-overlay" role="group" aria-label={words.title}>
      <p className="ar-overlay-title">{words.title}</p>
      <p className="ar-overlay-pitch">{words.pitch}</p>
      <div className="ar-overlay-actions">
        <button type="button" className="du-cta" onClick={onPlay} autoFocus>
          {ARCADE.title.play}
        </button>
        <span className="ar-overlay-best">{best === null ? ARCADE.title.noBest : ARCADE.title.best(ARCADE.fmt(best))}</span>
      </div>
    </div>
  );
}

function bannerOf(post: PostState): { banner: string; best: boolean; sub: string | null; tone: "refused" | null } {
  switch (post.kind) {
    case "checking":
      return { banner: ARCADE.over.over, best: false, sub: ARCADE.over.checking, tone: null };
    case "posted":
      if (post.isBest) return { banner: ARCADE.over.newBest, best: true, sub: post.rank === 1 ? ARCADE.over.topOfBoard : ARCADE.over.ranked(post.rank), tone: null };
      return { banner: ARCADE.over.ranked(post.rank), best: false, sub: post.rank <= 10 ? ARCADE.over.onBoard : ARCADE.over.keepClimbing, tone: null };
    case "refused":
      return { banner: ARCADE.over.over, best: false, sub: ARCADE.over.refused(post.why), tone: "refused" };
    case "local":
      return { banner: ARCADE.over.over, best: false, sub: post.why === null ? null : ARCADE.over.local[post.why], tone: null };
  }
}

/** The run as it stands at the tap: the score, a new best, where it ranked, its seed and length. */
function shareOf(game: ArcadeGame, end: RunEnd, post: PostState): ShareInput {
  const title = ARCADE.games[game].title;
  const score = ARCADE.fmt(end.score);
  const url = `${window.location.origin}${gameEntry(game).nav.href}`;
  const meta = `${ARCADE.over.seed(end.seed)} · ${ARCADE.over.length((end.durationMs / 1_000).toFixed(1))}`;
  return {
    image: { kind: "score", game: title, score, best: post.kind === "posted" && post.isBest, rank: post.kind === "posted" ? ARCADE.over.ranked(post.rank) : null, meta, url },
    fileName: `mitoshi-${game}-${Math.round(end.score)}.png`,
    text: SHARE.scorePost(score, title),
    url,
  };
}

export function OverOverlay({ game, end, post, onAgain }: { game: ArcadeGame; end: RunEnd; post: PostState; onAgain: () => void }) {
  const { banner, best, sub, tone } = bannerOf(post);
  return (
    <div className="ar-overlay" role="group" aria-live="polite">
      <p className="ar-overlay-banner" data-best={best || undefined}>
        {banner}
      </p>
      <p className="ar-overlay-score">{ARCADE.fmt(end.score)}</p>
      {sub && (
        <p className="ar-overlay-sub" data-tone={tone ?? undefined}>
          {sub}
        </p>
      )}
      <p className="ar-overlay-meta">
        {ARCADE.over.seed(end.seed)} · {ARCADE.over.length((end.durationMs / 1_000).toFixed(1))}
        {end.calm ? ` · ${ARCADE.board.calm}` : ""}
      </p>
      <div className="ar-overlay-actions">
        <button type="button" className="du-cta" onClick={onAgain} autoFocus>
          {ARCADE.over.again}
        </button>
        <SharePill amounts={false} input={() => shareOf(game, end, post)} />
      </div>
    </div>
  );
}
