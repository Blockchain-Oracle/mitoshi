"use client";
/**
 * §01 Live windows (Ported from Masayume 68f7a09:web/src/features/markets/lanes/{CadenceLanes,LaneTabs,LaneRows}.tsx
 * with Agari 03b30ab's TickerLane and ticker picker): tabs per (basis, cadence) lane, a ticker filter, the soonest
 * Windows first, eight a page. An empty pinned lane says it is between rounds instead of jumping away.
 */
import type { MarketId, Side } from "@cwf/core";
import { betweenRoundsLine } from "@cwf/core/copy";
import { useDeferredValue } from "react";
import { EmptyState, ReadingBoundary } from "@/components/states";
import { useMarketSession } from "@/features/markets/session";
import { SESSION } from "@/features/markets/session/copy";
import { useSessionPhrase } from "@/lib/when";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNowMs } from "@/lib/clock";
import { usePager } from "@/lib/use-pager";
import { cn } from "@/lib/utils";
import { MARKETS } from "../copy";
import { laneKeyOf, laneTabLabel, laneTabParts, laneTickers, tickerMarkets, type LaneTabKey } from "../data/lane-view";
import type { LanesState } from "../data/useLanesState";
import { useTopsOfBook } from "../data/useTopOfBook";
import { Pager } from "../Pager";
import { MarketCard } from "./MarketCard";

const PAGE_SIZE = 8;
/** A card in a long list polls its book slowly; the stream refreshes it on every book event. */
const CARD_BOOK_POLL_MS = 15_000;

interface CadenceLanesProps {
  state: LanesState;
  selectedMarketId: MarketId | null;
  onSelect: (marketId: MarketId, side?: Side) => void;
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

export function CadenceLanes({ state, selectedMarketId, onSelect }: CadenceLanesProps) {
  const lane = state.activeLane;
  const markets = lane ? tickerMarkets(lane, state.ticker) : [];
  const pager = usePager(markets, PAGE_SIZE);
  // The page's books through one subscription, rendered in the background (D-184).
  const tops = useDeferredValue(useTopsOfBook(pager.slice, CARD_BOOK_POLL_MS));
  const topById = new Map(pager.slice.map((m, i) => [m.marketId, tops[i]] as const));
  const tickers = lane ? laneTickers(lane) : [];
  return (
    <ReadingBoundary reading={state.reading} shape="cards" retry={state.retry} isEmpty={(set) => set.lanes.length === 0 && !state.pinnedMissing} empty={MARKETS.noLiveWindows}>
      {(laneSet) => {
        const tabs = laneSet.lanes.map((l) => ({ key: laneKeyOf(l), count: l.markets.length }));
        if (state.pinnedMissing && state.activeKey && !tabs.some((t) => t.key === state.activeKey)) tabs.push({ key: state.activeKey, count: 0 });
        return (
          <div className="flex flex-col gap-4">
            <Tabs value={state.activeKey ?? undefined} onValueChange={(v) => state.pin(v as LaneTabKey)}>
              <TabsList variant="line" className="h-touch w-full justify-start overflow-x-auto group-data-horizontal/tabs:h-touch" aria-label={MARKETS.laneGroup}>
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.key} value={tab.key} className="type-body-strong min-h-touch flex-none px-3">
                    {laneTabLabel(tab.key)}
                    <span className="numbers type-label-micro text-ink-muted" aria-label={MARKETS.live(tab.count)}>{tab.count}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {tickers.length > 1 || state.ticker !== null ? (
              <div role="radiogroup" aria-label={MARKETS.tickerGroup} className="flex gap-2 overflow-x-auto pb-1">
                {[null, ...tickers].map((t) => (
                  <button
                    key={t ?? "all"}
                    type="button"
                    role="radio"
                    aria-checked={state.ticker === t}
                    onClick={() => state.pinTicker(t)}
                    className={cn("min-h-touch shrink-0 rounded-full border px-4 type-body-strong", state.ticker === t ? "border-border-strong bg-surface-2 text-ink" : "border-hairline text-ink-secondary")}
                  >
                    {t ?? MARKETS.allTickers}
                  </button>
                ))}
              </div>
            ) : null}
            {lane === null || lane.markets.length === 0 ? (
              state.activeKey ? <Between laneKey={state.activeKey} /> : null
            ) : markets.length === 0 ? (
              <EmptyState why={MARKETS.noTickerHere(state.ticker ?? "", laneTabLabel(laneKeyOf(lane)))} nextAction={{ label: MARKETS.allTickers, onClick: () => state.pinTicker(null) }} />
            ) : (
              <>
                <div className="markets-grid markets-grid-live">
                  {pager.slice.map((m) => (
                    <MarketCard key={m.marketId} market={m} selected={m.marketId === selectedMarketId} onSelect={onSelect} upCents={topById.get(m.marketId)?.upCents ?? null} downCents={topById.get(m.marketId)?.downCents ?? null} hydrating={topById.get(m.marketId)?.hydrating ?? true} />
                  ))}
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
