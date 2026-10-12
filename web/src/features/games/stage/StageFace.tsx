"use client";

import type { DeckCard } from "@cwf/core/games";
import { formatClock } from "@cwf/core/units";
import { Clock } from "lucide-react";
import type { ReactNode } from "react";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { BearMark, BullMark, CoinMark } from "../art/PixelArt";
import { STAGE } from "./copy";
import { cadenceLabel } from "./SwipeDeck";

/** Flicky's ramp on every clock: calm, then signal inside ten minutes, then the loss colour inside two — and a pulse in the last thirty seconds. */
export function clockUrgency(remainingSec: number): { level: "calm" | "near" | "last"; pulse: boolean } {
  return { level: remainingSec <= 120 ? "last" : remainingSec <= 600 ? "near" : "calm", pulse: remainingSec > 0 && remainingSec <= 30 };
}

/** One of the two live figures under the question — the reference's `now` and `stake` pills. */
export interface StagePill {
  label: string;
  value: ReactNode;
  tone?: "up" | "down" | "live";
}

export interface StageFaceProps {
  card: DeckCard;
  /** Where this card sits in its deck: the title band's `N/M`. */
  place: { position: number; total: number };
  /** The quote box's eyebrow, and the question it sets up. */
  eyebrow: string;
  question: ReactNode;
  /** The two live figures. A mode with only one still gets a two-column band. */
  pills: readonly StagePill[];
  /** Chain-corrected now from the port; omitted, the clock ticks locally. */
  nowMs?: number;
}

/**
 * One card's face in Flicky's five bands (`swipe-screen.tsx` L300–451), in the venue's tokens: the title
 * banner (the asset, its cadence, N/M), the art window behind a CRT face, the quote box (an eyebrow, the
 * question, the settle clock), the two stat pills, and — drawn by the deck, not here — the calls with a
 * side's odds on each. The countdown is always the Window's real expiry, whatever the mode scores on: a
 * card is a claim on a specific live Window and a player has to be able to see how much of it is left.
 */
export function StageFace({ card, place, eyebrow, question, pills, nowMs }: StageFaceProps) {
  const remainingSec = card.expirySec - Math.floor((nowMs ?? Date.now()) / 1_000);
  const urgency = clockUrgency(remainingSec);
  return (
    <>
      <div className="st-band st-band--title">
        <span className="st-title-asset">
          <AssetDisc asset={card.asset} className="st-asset-disc" />
          {STAGE.pair(card.asset)}
        </span>
        <span className="st-cadence">{cadenceLabel(card.intervalSec)}</span>
        <span className="st-title-place">
          {place.position}/{place.total}
        </span>
      </div>

      {/* Flicky's art window (L318–338): the mascot reacts to the lean — the coin at rest, the bull on an
          upward drag, the bear on a downward one — behind a CRT face with a screw in each corner. The
          card's own `data-swipe` drives the swap, so the face knows nothing about the gesture. */}
      <div className="st-art crt-screen" aria-hidden>
        <span className="st-art-screw st-art-screw--tl" />
        <span className="st-art-screw st-art-screw--tr" />
        <span className="st-art-screw st-art-screw--bl" />
        <span className="st-art-screw st-art-screw--br" />
        <CoinMark className="st-art-idle" />
        <BullMark className="st-art-up" />
        <BearMark className="st-art-down" />
      </div>

      <div className="st-band st-band--quote">
        <span className="st-quote-inset" aria-hidden />
        <p className="st-eyebrow">{eyebrow}</p>
        <p className="st-question">{question}</p>
        <p className="st-clock" role="timer" data-urgency={urgency.level} data-pulse={urgency.pulse || undefined}>
          <Clock aria-hidden />
          {nowMs === 0 ? STAGE.clockPending : remainingSec <= 0 ? STAGE.settling : STAGE.settlesIn(formatClock(remainingSec))}
        </p>
      </div>

      <div className="st-pills">
        {pills.map((pill) => (
          <div key={pill.label} className="st-band st-pill">
            <span className="st-pill-k">{pill.label}</span>
            <span className="st-pill-v" data-tone={pill.tone}>
              {pill.value}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
