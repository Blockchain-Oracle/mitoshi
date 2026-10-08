"use client";
/**
 * §02 "Just ask" (Ported from Masayume 68f7a09:web/src/features/markets/word-board/{WordMarketBoard,WordCard}.tsx): the
 * same live Windows said as plain Yes/No questions, grouped by how soon they close, Listed stock Windows last as
 * "Schedule a call" (Agari S23). The level is the Window's own opening print and each answer's price is the top of
 * its real book — no model, no invented line; the bar is a stated derivation of the two asks.
 */
import type { EventMarket, LaneSet, MarketId, Side } from "@cwf/core";
import { groupByHorizon } from "@cwf/core";
import { PLAIN_WORDS, wordQuestion } from "@cwf/core/copy";
import { formatWallClock } from "@cwf/core/units";
import { useDeferredValue } from "react";
import { Countdown } from "@/components/data";
import { useClockValue } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { MARKETS, WORD_BOARD } from "../copy";
import { laneTabKey, laneTabLabel } from "../data/lane-view";
import { useTopsOfBook, type TopOfBook } from "../data/useTopOfBook";
import { AssetDisc } from "../hero/AssetDisc";
import { PRICE_SCALE } from "../units";

const WORD_BOOK_POLL_MS = 30_000;

type Select = (marketId: MarketId, side?: Side) => void;

function impliedUpShare(up: number | null, down: number | null): number | null {
  if (up === null || down === null || up + down === 0) return null;
  return Math.round((up / (up + down)) * 100);
}

// The card takes its book's top as plain values from the board's one subscription (D-184), so a batch of answers
// re-renders only the cards whose numbers moved.
function WordCard({ market, upCents, downCents, hydrating, onSelect }: { market: EventMarket; onSelect: Select } & TopOfBook) {
  const closeClock = formatWallClock(market.expirySec * 1000);
  const question = wordQuestion({ ...market, marketId: String(market.marketId) }, PRICE_SCALE, closeClock);
  const share = impliedUpShare(upCents, downCents);
  const cents = (v: number | null) => (v === null ? (hydrating ? "…" : MARKETS.noBook) : `${v}¢`);
  return (
    <div className="wq-card">
      <div className="wq-top">
        <AssetDisc asset={market.asset} className="wq-btc" />
        <span className="wq-meta">{market.asset} · {laneTabLabel(laneTabKey(market.lane, market.intervalSec))}</span>
        <Countdown expirySec={market.expirySec} intervalSec={market.intervalSec} className="wq-clock" />
      </div>
      <p className={cn("wq-q", question.pending && "wq-q-pending")}>{question.text}</p>
      {share === null ? <div className="wq-oddsbar wq-oddsbar-unknown" aria-hidden /> : <div className="wq-oddsbar" aria-hidden><div className="wq-oddsfill" style={{ width: `${share}%` }} /></div>}
      <div className="wq-oddsrow">
        <span className="wq-close">{WORD_BOARD.closes(closeClock)}</span>
        <span className="wq-yeslead">{share === null ? WORD_BOARD.noLean : WORD_BOARD.implied(share)}</span>
      </div>
      <div className="wq-actions">
        <button type="button" className="wq-btn yes" onClick={() => onSelect(market.marketId, "up")} aria-label={`${PLAIN_WORDS.yes} · ${question.text} · ${cents(upCents)}`}>
          <span className="wq-side">{PLAIN_WORDS.yes}</span>
          <span className="wq-cents">{cents(upCents)}</span>
        </button>
        <button type="button" className="wq-btn no" onClick={() => onSelect(market.marketId, "down")} aria-label={`${PLAIN_WORDS.no} · ${question.text} · ${cents(downCents)}`}>
          <span className="wq-side">{PLAIN_WORDS.no}</span>
          <span className="wq-cents">{cents(downCents)}</span>
        </button>
      </div>
    </div>
  );
}

export function WordMarketBoard({ laneSet, onSelect }: { laneSet: LaneSet | null; onSelect: Select }) {
  // The board groups on a minute's resolution and re-renders once a minute, not every tick (D-181): each card's
  // countdown reads the shared clock as its own leaf.
  const minuteMs = useClockValue((nowMs) => Math.floor(nowMs / 60_000) * 60_000);
  const groups = groupByHorizon(laneSet, minuteMs);
  // Every card's book through one subscription, rendered in the background (D-184): a batch of book answers re-renders
  // the board once, time-sliced, instead of ~50 cards in one blocking pass.
  const shown = groups.flatMap((group) => group.markets);
  const tops = useDeferredValue(useTopsOfBook(shown, WORD_BOOK_POLL_MS));
  const topById = new Map(shown.map((m, i) => [m.marketId, tops[i]] as const));
  if (laneSet === null || minuteMs === 0) return <div className="words-empty">{WORD_BOARD.reading}</div>;
  if (groups.length === 0) return <div className="words-empty">{WORD_BOARD.between}</div>;
  return (
    <>
      {groups.map((group) => (
        <section key={group.key} className="words-section" aria-label={group.label}>
          <div className="words-sechead">
            <span className="words-sec-label">{group.label}</span>
            <span className="words-sec-count">{group.markets.length}</span>
          </div>
          <div className="words-grid">
            {group.markets.map((m) => (
              <WordCard key={m.marketId} market={m} upCents={topById.get(m.marketId)?.upCents ?? null} downCents={topById.get(m.marketId)?.downCents ?? null} hydrating={topById.get(m.marketId)?.hydrating ?? true} onSelect={onSelect} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
