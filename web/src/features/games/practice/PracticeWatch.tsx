"use client";

import { PRACTICE_WATCH_SEC, practiceBotSide, type PracticeRound } from "@cwf/core/games";
import type { AssetPrice } from "@cwf/core/types";
import { useEffect, type CSSProperties } from "react";
import { useGames } from "../GamesProvider";
import { RaceRow } from "./BeatParts";
import { PRACTICE } from "./copy";

const BEEP_FROM_SEC = 5;

/**
 * The thirty seconds between the last swipe and the score, as five races (R4-9, D-227; Senryo `WarmUpScreen` "the five
 * races run live — the move since your pick and who leads it"). A lead is not a verdict: nothing is called until the
 * close. The last five seconds count down out loud. A card whose feed is unreadable shows a dash, never its entry.
 */
export function PracticeWatch({ round, leftSec, priceOf }: { round: PracticeRound; leftSec: number; priceOf: (asset: string) => AssetPrice | null }) {
  const { feedback } = useGames();
  const fraction = Math.max(0, Math.min(1, leftSec / PRACTICE_WATCH_SEC));
  useEffect(() => {
    if (leftSec > 0 && leftSec <= BEEP_FROM_SEC) feedback("click");
  }, [leftSec, feedback]);

  return (
    <section className="pr-watch" aria-label={PRACTICE.watch.label}>
      <div className="pr-watch-head">
        <h2 className="pr-watch-title">{PRACTICE.watch.label}</h2>
        <span className="pr-watch-clock" role="timer" data-last={leftSec <= BEEP_FROM_SEC || undefined}>
          {PRACTICE.watch.left(leftSec)}
        </span>
      </div>
      <div className="pr-watch-bar" aria-hidden>
        <span className="pr-watch-fill" style={{ "--pr-left": fraction } as CSSProperties} />
      </div>
      <ul className="pr-races">
        {round.picks
          .slice()
          .sort((a, b) => a.cardIndex - b.cardIndex)
          .map((pick) => {
            const card = round.cards.find((c) => c.index === pick.cardIndex);
            if (!card) return null;
            return <RaceRow key={pick.cardIndex} card={card} pick={pick} coin={practiceBotSide(round.seed, pick.cardIndex)} nowRaw={priceOf(card.asset)?.priceRaw ?? null} result={null} />;
          })}
      </ul>
    </section>
  );
}
