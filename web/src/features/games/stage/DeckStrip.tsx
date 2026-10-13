"use client";
// Practice's deck as a strip (R6 games §4.2.3; From 21st.dev 19086 uilayout.contact/framer-moveable-thumbnails — the
// filmstrip whose active thumbnail widens — without its drag carousel or images, its spring mapped to a 200 ms CSS
// transition). Five tiles replace the slots, the pips and "CARD 1 OF 5": an upcoming card shows its asset and its
// half-hour line; the active one widens and lifts with "Now"; a swiped one shows your call, the coin's flipping in and
// its own 30 s ring from the swipe (the card's "30 s" is now true for every card, core's per-card close); a scored one
// its stamp; one whose price was missing at its close says so.
import { practiceBotSide, type DeckCard, type PracticeCardResult, type PracticePick } from "@cwf/core/games";
import { CountdownRing } from "@/components/kit/CountdownRing";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { tickerOf } from "../lanes";
import { CardLine, SideChip } from "../practice/BeatParts";
import { PRACTICE } from "../practice/copy";

export type TileResult = PracticeCardResult | "unscored" | null;

export interface DeckStripProps {
  seed: string;
  cards: readonly DeckCard[];
  picks: readonly PracticePick[];
  active: DeckCard | null;
  /** A swiped card's own close (its swipe + 30 s). */
  closesAtMs: (cardIndex: number) => number | null;
  /** The revealed verdict per card index (null until revealed). */
  results: readonly TileResult[];
  nowMs: number;
}

const S = PRACTICE.strip;

export function DeckStrip({ seed, cards, picks, active, closesAtMs, results, nowMs }: DeckStripProps) {
  return (
    <ol className="ds" aria-label={S.label}>
      {cards.map((card, i) => {
        const pick = picks.find((p) => p.cardIndex === card.index);
        const result = results[card.index] ?? null;
        const ticker = tickerOf(card.asset);
        const closes = closesAtMs(card.index);
        const state = result ? (result === "unscored" ? "unscored" : "scored") : pick ? "racing" : card.index === active?.index ? "active" : "upcoming";
        const coin = practiceBotSide(seed, card.index);
        const leftSec = closes && nowMs > 0 ? Math.max(0, Math.ceil((closes - nowMs) / 1000)) : null;
        const label =
          state === "active" ? S.tile.active(ticker, i + 1, cards.length)
          : state === "racing" && pick ? S.tile.racing(ticker, pick.side, coin, leftSec)
          : state === "scored" && result && result !== "unscored" ? S.tile.scored(ticker, result)
          : state === "unscored" ? S.tile.unscored(ticker)
          : S.tile.upcoming(ticker, i + 1, cards.length);
        return (
          <li key={card.index} className="ds-tile" data-state={state} data-side={pick?.side} data-result={result ?? undefined} aria-current={state === "active" ? "step" : undefined} aria-label={label}>
            <AssetDisc asset={card.asset} className="gm-disc ds-disc" />
            {state === "upcoming" || state === "active" ? (
              <>
                <span className="ds-ticker">{ticker}</span>
                <span className="ds-line" aria-hidden><CardLine asset={card.asset} nowMs={nowMs} entryE8={null} /></span>
                {state === "active" ? <span className="ds-now">{S.now}</span> : null}
              </>
            ) : state === "racing" && pick && closes ? (
              <>
                <span className="ds-calls">
                  <SideChip side={pick.side} />
                  <span key={`coin-${card.index}`} className="pr-coin-flip"><SideChip side={coin} coin /></span>
                </span>
                <CountdownRing startMs={pick.atMs} endMs={closes} size="sm" className="ds-ring" />
              </>
            ) : state === "scored" && result && result !== "unscored" ? (
              <span className="ds-stamp" data-result={result}>{PRACTICE.result.cardResult[result]}</span>
            ) : (
              <span className="ds-none">{S.noPrice}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
