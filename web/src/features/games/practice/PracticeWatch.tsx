"use client";

import { practiceBotSide, type PracticeRound } from "@cwf/core/games";
import type { AssetPrice } from "@cwf/core/types";
import { useEffect } from "react";
import { useGames } from "../GamesProvider";
import { RaceRow } from "./BeatParts";
import { PRACTICE } from "./copy";

const BEEP_FROM_SEC = 5;

/**
 * The races after the last swipe (R6 games §4.2.4: one countdown to the round's end, each race its own ring to its own
 * close), as five races (R4-9, D-227; Senryo `WarmUpScreen` "the five
 * races run live — the move since your pick and who leads it"). A lead is not a verdict: nothing is called until the
 * close. The last five seconds count down out loud. A card whose feed is unreadable shows a dash, never its entry.
 */
export function PracticeWatch({ round, leftSec, priceOf, closesAtMs }: { round: PracticeRound; leftSec: number; priceOf: (asset: string) => AssetPrice | null; closesAtMs: (cardIndex: number) => number | null }) {
  const { feedback } = useGames();
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
      <ul className="pr-races">
        {round.picks
          .slice()
          .sort((a, b) => a.cardIndex - b.cardIndex)
          .map((pick) => {
            const card = round.cards.find((c) => c.index === pick.cardIndex);
            if (!card) return null;
            const closed = round.closes.some((c) => c.cardIndex === pick.cardIndex);
            return <RaceRow key={pick.cardIndex} card={card} pick={pick} coin={practiceBotSide(round.seed, pick.cardIndex)} nowRaw={priceOf(card.asset)?.priceRaw ?? null} result={null} closesAtMs={closed ? null : closesAtMs(pick.cardIndex)} />;
          })}
      </ul>
    </section>
  );
}
