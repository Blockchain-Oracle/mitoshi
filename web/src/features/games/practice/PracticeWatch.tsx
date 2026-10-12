"use client";

import { PRACTICE_WATCH_SEC, type PracticeRound } from "@cwf/core/games";
import type { CSSProperties } from "react";
import type { AssetPrice } from "@cwf/core/types";
import { PRACTICE } from "./copy";
import { PracticeRow } from "./PracticeRow";

/**
 * The thirty seconds between the last swipe and the score.
 *
 * Every card's live move is on screen and none of them is called yet: the bar and the clock are the
 * only things claiming anything, and what they claim is how long is left. The rows update because
 * the feed does — a card whose feed is unreadable shows a dash rather than freezing at its entry,
 * which would read as "no movement".
 */
export function PracticeWatch({ round, leftSec, priceOf }: { round: PracticeRound; leftSec: number; priceOf: (asset: string) => AssetPrice | null }) {
  const fraction = Math.max(0, Math.min(1, leftSec / PRACTICE_WATCH_SEC));

  return (
    <section className="pr-watch" aria-label={PRACTICE.watch.label}>
      <div className="pr-watch-head">
        <h2 className="pr-watch-title">{PRACTICE.watch.label}</h2>
        <span className="pr-watch-clock" role="timer">
          {PRACTICE.watch.left(leftSec)}
        </span>
      </div>
      <div className="pr-watch-bar" aria-hidden>
        <span className="pr-watch-fill" style={{ "--pr-left": fraction } as CSSProperties} />
      </div>
      <p className="pr-foot">{PRACTICE.watch.body}</p>

      <div className="pr-rows">
        {round.picks
          .slice()
          .sort((a, b) => a.cardIndex - b.cardIndex)
          .map((pick) => {
            const card = round.cards.find((c) => c.index === pick.cardIndex);
            if (!card) return null;
            return (
              <PracticeRow key={pick.cardIndex} card={card} side={pick.side} entryRaw={pick.entryRaw} closeRaw={priceOf(card.asset)?.priceRaw ?? null} />
            );
          })}
      </div>
    </section>
  );
}
