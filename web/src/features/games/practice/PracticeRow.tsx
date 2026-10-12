"use client";

import { practiceMove, type DeckCard, type Pick, type PracticeCardResult, type PracticeMove } from "@cwf/core/games";
import { cadenceLabel } from "../stage/SwipeDeck";
import { PRACTICE } from "./copy";

/**
 * One card, in the watch and again in the result.
 *
 * The two differ in exactly one thing — the watch has no verdicts, because a card that is "winning"
 * eight seconds into a thirty-second watch has won nothing, and putting the word on screen would be
 * a result the round has not reached. Verdicts arrive with the close.
 */

/** The move as a signed percentage, computed in integers and only made a float to be printed. */
export function movePercent(entryRaw: bigint, closeRaw: bigint): string {
  if (entryRaw === 0n) return "—";
  const thousandthsOfPercent = ((closeRaw - entryRaw) * 100_000n) / entryRaw;
  const value = Number(thousandthsOfPercent) / 1_000;
  return `${value > 0 ? "+" : ""}${value.toFixed(3)}%`;
}

export function moveClass(move: PracticeMove): string {
  return move === "up" ? "pr-up" : move === "down" ? "pr-down" : "pr-flat";
}

interface PracticeRowProps {
  card: DeckCard;
  side: Pick;
  entryRaw: bigint;
  /** The live reading while watching, or the close once the round is scored. Null when unreadable. */
  closeRaw: bigint | null;
  botSide?: Pick;
  you?: PracticeCardResult;
  bot?: PracticeCardResult;
}

function Side({ label, side, verdict }: { label: string; side: Pick; verdict?: PracticeCardResult }) {
  return (
    <span className="pr-side">
      <span className={`pr-side-dot pr-side-dot--${side}`} aria-hidden />
      {label} · {PRACTICE.result.call[side]}
      {verdict && <span className={`pr-side-verdict pr-side-verdict--${verdict}`}>{PRACTICE.result.cardResult[verdict]}</span>}
    </span>
  );
}

export function PracticeRow({ card, side, entryRaw, closeRaw, botSide, you, bot }: PracticeRowProps) {
  const move = closeRaw === null ? null : practiceMove(entryRaw, closeRaw);

  return (
    <div className="pr-row">
      <div className="pr-row-name">
        <span className="pr-row-asset">{card.asset}</span>
        <span className="pr-row-meta">{cadenceLabel(card.intervalSec)}</span>
      </div>
      <span className={`pr-row-move ${move ? moveClass(move) : "pr-flat"}`}>
        {move && (
          <span className="pr-row-arrow" aria-hidden>
            {PRACTICE.result.arrow[move]}
          </span>
        )}
        {closeRaw === null ? "—" : movePercent(entryRaw, closeRaw)}
      </span>
      <div className="pr-row-sides">
        {/* The bot's side reads as a call, not as a prediction — the copy names it a coin flip once, above. */}
        <Side label={PRACTICE.result.you} side={side} verdict={you} />
        {botSide && <Side label={PRACTICE.result.bot} side={botSide} verdict={bot} />}
      </div>
    </div>
  );
}
