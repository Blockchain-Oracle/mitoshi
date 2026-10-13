"use client";
/**
 * §02 "Just ask" (Ported from Masayume 68f7a09:web/src/features/markets/word-board/{WordMarketBoard,WordCard}.tsx; R4-3
 * D-227 from Owarine 90a91d71 WordMarketBoard/WordCard/WordListedCard): the same live Windows said as plain Yes/No
 * questions, grouped by how soon they close, narrowed by the rail's pinned ticker (Owarine `forTicker`). A failed read
 * says why instead of "reading" forever; while US stocks are shut a strip says so once; an empty book is "No quotes yet ·
 * Open"; listed stock Windows are one card per company with their lengths as chips. The level is the Window's own opening
 * print and each answer's price is the top of its real book — no model, no invented line.
 */
import type { Diagnosis, EventMarket, LaneSet, MarketId, Side } from "@cwf/core";
import { groupByHorizon, isAllHoursLane, LISTED_HORIZON } from "@cwf/core";
import { diagnosisCopy, formatCadence, PLAIN_WORDS, wordQuestion } from "@cwf/core/copy";
import { formatWallClock } from "@cwf/core/units";
import { useDeferredValue, useMemo, useState } from "react";
import { Countdown } from "@/components/data";
import { useMarketSession } from "@/features/markets/session";
import { useClockValue } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { useSessionPhrase } from "@/lib/when";
import { CLOSED, LANE_CARD, MARKETS, WORD_BOARD } from "../copy";
import { useTopsOfBook, type TopOfBook } from "../data/useTopOfBook";
import { AssetDisc } from "../hero/AssetDisc";
import { PRICE_SCALE } from "../units";

const WORD_BOOK_POLL_MS = 30_000;

type Select = (marketId: MarketId, side?: Side) => void;

function impliedUpShare(up: number | null, down: number | null): number | null {
  if (up === null || down === null || up + down === 0) return null;
  return Math.round((up / (up + down)) * 100);
}

function forTicker(laneSet: LaneSet | null, ticker: string | null): LaneSet | null {
  if (laneSet === null || ticker === null) return laneSet;
  return { ...laneSet, lanes: laneSet.lanes.map((lane) => ({ ...lane, markets: lane.markets.filter((m) => m.asset === ticker) })) };
}

/** Listed Windows as one card per company, in the group's order. */
function byAsset(markets: readonly EventMarket[]): EventMarket[][] {
  const rows = new Map<string, EventMarket[]>();
  for (const m of markets) rows.set(m.asset, [...(rows.get(m.asset) ?? []), m]);
  return [...rows.values()];
}

// The card takes its book's top as plain values from the board's one subscription (D-184), so a batch of answers
// re-renders only the cards whose numbers moved.
function WordCard({ market, upCents, downCents, hydrating, onSelect }: { market: EventMarket; onSelect: Select } & TopOfBook) {
  const closeClock = formatWallClock(market.expirySec * 1000);
  const question = wordQuestion({ ...market, marketId: String(market.marketId) }, PRICE_SCALE, closeClock);
  const share = impliedUpShare(upCents, downCents);
  const cents = (v: number | null) => (v === null ? (hydrating ? "…" : MARKETS.noBook) : `${v}¢`);
  const unquoted = !hydrating && upCents === null && downCents === null;
  return (
    <div className="wq-card">
      <div className="wq-top">
        <AssetDisc asset={market.asset} className="wq-btc" />
        <span className="wq-meta">{market.asset}</span>
        {isAllHoursLane(market.lane) ? <span className="wq-kind">{WORD_BOARD.kind247}</span> : null}
        <Countdown expirySec={market.expirySec} intervalSec={market.intervalSec} className="wq-clock" />
      </div>
      <p className={cn("wq-q", question.pending && "wq-q-pending")}>{question.text}</p>
      {unquoted ? (
        <div className="wq-unquoted">
          <span className="wq-unquoted-dot" aria-hidden />
          <span className="wq-unquoted-text">{WORD_BOARD.unquoted}</span>
          <button type="button" className="wq-unquoted-open min-h-touch" onClick={() => onSelect(market.marketId)}>{WORD_BOARD.open}</button>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

/** One company's listed Windows (Owarine `WordListedCard`): when it opens, its lengths, and Up or Down into the ticket. */
function WordListedCard({ markets, onSelect }: { markets: readonly EventMarket[]; onSelect: Select }) {
  const [picked, setPicked] = useState(0);
  const market = markets[Math.min(picked, markets.length - 1)];
  if (!market) return null;
  return (
    <div className="wq-card wq-listed">
      <div className="wq-top">
        <AssetDisc asset={market.asset} className="wq-btc" />
        <span className="wq-meta">{market.asset}</span>
        <span className="wq-listed-chip">{LANE_CARD.opensAt(formatWallClock(market.tradingStartSec * 1000))}</span>
      </div>
      <p className="wq-listed-when">{WORD_BOARD.listedWhy}</p>
      {markets.length > 1 && (
        <div className="wq-cadences" role="group" aria-label={MARKETS.laneGroup}>
          {markets.map((m, i) => (
            <button key={String(m.marketId)} type="button" className="wq-cadence min-h-touch" aria-pressed={i === picked} onClick={() => setPicked(i)}>
              {formatCadence(m.intervalSec)}
            </button>
          ))}
        </div>
      )}
      <div className="wq-actions">
        <button type="button" className="wq-btn yes" onClick={() => onSelect(market.marketId, "up")}>
          <span className="wq-side">{MARKETS.up}</span>
        </button>
        <button type="button" className="wq-btn no" onClick={() => onSelect(market.marketId, "down")}>
          <span className="wq-side">{MARKETS.down}</span>
        </button>
      </div>
    </div>
  );
}

export function WordMarketBoard({ laneSet: allLanes, ticker, failure, onSelect }: { laneSet: LaneSet | null; ticker: string | null; failure: Diagnosis | null; onSelect: Select }) {
  const laneSet = useMemo(() => forTicker(allLanes, ticker), [allLanes, ticker]);
  // The board groups on a minute's resolution and re-renders once a minute, not every tick (D-181): each card's
  // countdown reads the shared clock as its own leaf.
  const minuteMs = useClockValue((nowMs) => Math.floor(nowMs / 60_000) * 60_000);
  const session = useMarketSession();
  const phrase = useSessionPhrase();
  const groups = groupByHorizon(laneSet, minuteMs);
  // Every quoted card's book through one subscription, rendered in the background (D-184).
  const shown = groups.filter((g) => g.key !== LISTED_HORIZON.key).flatMap((group) => group.markets);
  const tops = useDeferredValue(useTopsOfBook(shown, WORD_BOOK_POLL_MS));
  const topById = new Map(shown.map((m, i) => [m.marketId, tops[i]] as const));
  if (laneSet === null && failure) return <div className="words-empty">{diagnosisCopy(failure.kind).body}</div>;
  if (laneSet === null || minuteMs === 0) return <div className="words-empty">{WORD_BOARD.reading}</div>;
  if (groups.length === 0) return <div className="words-empty">{WORD_BOARD.between}</div>;
  const closed = session !== null && !session.open;
  return (
    <>
      {closed && (
        <div className="words-closed" role="status">
          <span className="words-closed-dot" aria-hidden />
          <strong>{CLOSED.stocksTitle}</strong>
          <span>{phrase(session.status, Math.floor(minuteMs / 1000))}</span>
        </div>
      )}
      {groups.map((group) => {
        const rows = group.key === LISTED_HORIZON.key ? byAsset(group.markets) : null;
        return (
          <section key={group.key} className="words-section" aria-label={group.label}>
            <div className="words-sechead">
              <span className="words-sec-label">{group.label}</span>
              <span className="words-sec-count">{rows ? rows.length : group.markets.length}</span>
            </div>
            <div className="words-grid">
              {rows
                ? rows.map((markets) => <WordListedCard key={markets[0]!.asset} markets={markets} onSelect={onSelect} />)
                : group.markets.map((m) => (
                    <WordCard key={m.marketId} market={m} upCents={topById.get(m.marketId)?.upCents ?? null} downCents={topById.get(m.marketId)?.downCents ?? null} hydrating={topById.get(m.marketId)?.hydrating ?? true} onSelect={onSelect} />
                  ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
