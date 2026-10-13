"use client";
/**
 * §01 Live windows (Ported from Masayume 68f7a09:web/src/features/markets/lanes/{CadenceLanes,LaneTabs,LaneRows}.tsx
 * with Agari 03b30ab's TickerLane and ticker picker): tabs per (basis, cadence) lane, a ticker filter, the soonest
 * Windows first, eight a page. An empty pinned lane says it is between rounds instead of jumping away.
 * R4-3 (D-227), Owarine 90a91d71: the ticker filter is Owarine's `TickerPicker` (underline tabs, not a second row of
 * pills under the lane tabs); a ticker the roller paused in this lane stands in its place as a `PausedCard`; every card
 * carries the Room strip (`onOpenRoom` — the screen holds the sheet).
 */
import type { EventMarket, MarketId, Side } from "@cwf/core";
import { betweenRoundsLine } from "@cwf/core/copy";
import { useDeferredValue } from "react";
import { EmptyState, ReadingBoundary } from "@/components/states";
import { useMarketSession } from "@/features/markets/session";
import { SESSION } from "@/features/markets/session/copy";
import { useSessionPhrase } from "@/lib/when";
import { ScrollRail } from "@/components/kit/ScrollRail";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNowMs } from "@/lib/clock";
import { usePager } from "@/lib/use-pager";
import { MARKETS } from "../copy";
import { laneKeyOf, laneTabLabel, laneTabParts, laneTickers, tickerMarkets, type LaneTabKey } from "../data/lane-view";
import type { LanesState } from "../data/useLanesState";
import { useTopsOfBook } from "../data/useTopOfBook";
import { Pager } from "../Pager";
import { MarketCard } from "./MarketCard";
import { PausedCard } from "./PausedCard";
import { pausedInLane } from "./paused";
import { TickerPicker } from "./TickerPicker";
import "@/components/kit/kit.css";

const PAGE_SIZE = 8;
/** A card in a long list polls its book slowly; the stream refreshes it on every book event. */
const CARD_BOOK_POLL_MS = 15_000;

interface CadenceLanesProps {
  state: LanesState;
  selectedMarketId: MarketId | null;
  onSelect: (marketId: MarketId, side?: Side) => void;
  onOpenRoom: (market: EventMarket) => void;
}

function Between({ laneKey }: { laneKey: LaneTabKey }) {
  const nowMs = useNowMs();
  const session = useMarketSession();
  const phrase = useSessionPhrase();
  const { basis, intervalSec } = laneTabParts(laneKey);
  // A Regular lane outside the session isn't between rounds: the market is shut, and it says until when (S6).
  if (basis === "regular" && session && !session.open && nowMs) return <EmptyState why={SESSION.regularClosed(phrase(session.status, Math.floor(nowMs / 1000)))} />;
  return <EmptyState why={betweenRoundsLine(null, nowMs, intervalSec)} />;
}

export function CadenceLanes({ state, selectedMarketId, onSelect, onOpenRoom }: CadenceLanesProps) {
  const session = useMarketSession();
  const lane = state.activeLane;
  const markets = lane ? tickerMarkets(lane, state.ticker) : [];
  const pager = usePager(markets, PAGE_SIZE);
  // The page's books through one subscription, rendered in the background (D-184).
  const tops = useDeferredValue(useTopsOfBook(pager.slice, CARD_BOOK_POLL_MS));
  const topById = new Map(pager.slice.map((m, i) => [m.marketId, tops[i]] as const));
  const live = lane ? laneTickers(lane) : [];
  const paused = lane ? pausedInLane(session, lane) : new Map<string, string>();
  // Every ticker worth a tab: listed in the lane, or paused in it (Owarine); a paused one with no Window stands in as a card.
  const tickers = [...live, ...[...paused.keys()].filter((t) => !live.includes(t))];
  const standIns = [...paused.entries()].filter(([t]) => !live.includes(t) && (state.ticker === null || state.ticker === t));
  return (
    <ReadingBoundary reading={state.reading} shape="cards" retry={state.retry} isEmpty={(set) => set.lanes.length === 0 && !state.pinnedMissing} empty={MARKETS.noLiveWindows}>
      {(laneSet) => {
        const tabs = laneSet.lanes.map((l) => ({ key: laneKeyOf(l), count: l.markets.length }));
        if (state.pinnedMissing && state.activeKey && !tabs.some((t) => t.key === state.activeKey)) tabs.push({ key: state.activeKey, count: 0 });
        return (
          <div className="flex flex-col gap-4">
            <Tabs value={state.activeKey ?? undefined} onValueChange={(v) => state.pin(v as LaneTabKey)}>
              {/* Eight lanes outrun a phone: the kit rail scrolls them with an edge fade where more wait (markets spec
                  needs21st[1], R4-3 review), as the ticker picker below. */}
              <ScrollRail label={MARKETS.laneGroup}>
                <TabsList variant="line" className="h-touch min-w-full justify-start group-data-horizontal/tabs:h-touch" aria-label={MARKETS.laneGroup}>
                  {tabs.map((tab) => (
                    <TabsTrigger key={tab.key} value={tab.key} className="type-body-strong min-h-touch flex-none px-3">
                      {laneTabLabel(tab.key)}
                      <span className="numbers type-label-micro text-ink-muted" aria-label={MARKETS.live(tab.count)}>{tab.count}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </ScrollRail>
            </Tabs>
            {tickers.length > 1 || state.ticker !== null ? (
              <TickerPicker tickers={tickers} paused={paused} intervalSec={lane?.intervalSec ?? 0} ticker={state.ticker} onPick={state.pinTicker} />
            ) : null}
            {lane === null || lane.markets.length === 0 ? (
              state.activeKey ? <Between laneKey={state.activeKey} /> : null
            ) : markets.length === 0 && standIns.length === 0 ? (
              <EmptyState why={MARKETS.noTickerHere(state.ticker ?? "", laneTabLabel(laneKeyOf(lane)))} nextAction={{ label: MARKETS.allTickers, onClick: () => state.pinTicker(null) }} />
            ) : (
              <>
                <div className="markets-grid markets-grid-live">
                  {pager.slice.map((m) => (
                    <MarketCard key={m.marketId} market={m} selected={m.marketId === selectedMarketId} onSelect={onSelect} onOpenRoom={onOpenRoom} upCents={topById.get(m.marketId)?.upCents ?? null} downCents={topById.get(m.marketId)?.downCents ?? null} hydrating={topById.get(m.marketId)?.hydrating ?? true} />
                  ))}
                  {!pager.canNext ? standIns.map(([t, st]) => <PausedCard key={`paused:${t}`} asset={t} intervalSec={lane.intervalSec} state={st} />) : null}
                </div>
                <Pager pager={pager} />
              </>
            )}
          </div>
        );
      }}
    </ReadingBoundary>
  );
}
