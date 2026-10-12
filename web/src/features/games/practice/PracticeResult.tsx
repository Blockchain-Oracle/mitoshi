"use client";

import type { PracticeRound, PracticeScore } from "@cwf/core/games";
import Link from "next/link";
import { useEffect } from "react";
import { useGames } from "../GamesProvider";
import { PRACTICE } from "./copy";
import { PracticeRow } from "./PracticeRow";

/**
 * The scoreboard.
 *
 * It is a count of cards and nothing else: no money, no rating, no streak, because practice writes
 * none of those and a number here that looked like one would be the fabrication the honesty rules
 * forbid. The one link onward is to the duel, which is where those numbers become real.
 *
 * A card the feed could not price at the close is missing from the rows and counted in one sentence
 * beneath, rather than being scored flat — "we could not read it" and "it did not move" are
 * different answers and only one of them is true.
 */
export function PracticeResult({ round, score, onAgain }: { round: PracticeRound; score: PracticeScore; onAgain: () => void }) {
  const { feedback } = useGames();
  const unscored = round.picks.length - score.cards.length;

  // One cue when the round lands, on the settings the player chose — never on every re-render.
  useEffect(() => {
    // A loss gets its own sound, not a tap: the result is the one moment the cue carries the verdict.
    feedback(score.winner === "you" ? "duel-win" : score.winner === "bot" ? "duel-lose" : "modal-open");
    // The round is over; the cue belongs to arriving here, not to the score object's identity.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const verdict = score.winner === "you" ? PRACTICE.result.won : score.winner === "bot" ? PRACTICE.result.lost : PRACTICE.result.tied;

  return (
    <section className="pr-watch" aria-label={PRACTICE.result.title}>
      <div className={`pr-score${score.winner ? ` pr-score--${score.winner === "you" ? "won" : "lost"}` : ""}`}>
        <div className="pr-score-side">
          <span className="pr-score-k">{PRACTICE.result.you}</span>
          <span className="pr-score-v">{score.youWon}</span>
        </div>
        <span className="pr-score-dash" aria-hidden>
          —
        </span>
        <div className="pr-score-side">
          <span className="pr-score-k">{PRACTICE.result.bot}</span>
          <span className="pr-score-v">{score.botWon}</span>
        </div>
        <p className="pr-score-verdict">{verdict}</p>
      </div>

      <div className="pr-rows">
        {score.cards.map((c) => (
          <PracticeRow
            key={c.card.index}
            card={c.card}
            side={c.side}
            botSide={c.botSide}
            entryRaw={c.entryRaw}
            closeRaw={c.closeRaw}
            you={c.you}
            bot={c.bot}
          />
        ))}
      </div>

      {score.cards.some((c) => c.move === "flat") && <p className="pr-foot">{PRACTICE.result.flatNote}</p>}
      {unscored > 0 && <p className="pr-foot">{PRACTICE.result.unscored(unscored)}</p>}
      <p className="pr-foot">{PRACTICE.result.botNote}</p>

      <div className="pr-actions">
        <button type="button" className="pr-link" onClick={onAgain}>
          {PRACTICE.result.again}
        </button>
        <Link href="/games/duel" className="pr-link pr-link--quiet">
          {PRACTICE.result.toDuel}
        </Link>
      </div>
    </section>
  );
}
