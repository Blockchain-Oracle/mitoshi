"use client";
/**
 * The page hero (Ported from Masayume 68f7a09:web/src/features/markets/MarketsHero.tsx): the market you are betting on
 * is the page — the question, the chart and the ticket as one object; the lanes below change it. Three faces before a
 * Window exists: loading, broken, genuinely empty.
 */
import type { EventMarket, MarketId, Side } from "@cwf/core";
import { isOk } from "@cwf/core";
import type { ReactNode } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { MARKETS } from "../copy";
import type { LaneTabKey } from "../data/lane-view";
import type { LanesState } from "../data/useLanesState";
import { HeroChart } from "./HeroChart";

export interface MarketsHeroProps {
  market: EventMarket | null;
  openingRaw: bigint | null;
  lanes: LanesState;
  resolving: boolean;
  onSelect: (marketId: MarketId, side?: Side) => void;
  onPickLane: (key: LaneTabKey, marketId: MarketId) => void;
  ticket: ReactNode;
}

function HeroPlaceholder({ lanes, resolving }: { lanes: LanesState; resolving: boolean }) {
  if (lanes.reading === null || resolving) return <LoadingState shape="chart" label={MARKETS.loadingWindows} />;
  if (!isOk(lanes.reading)) return <ErrorState diagnosis={lanes.reading.error} retry={lanes.retry} />;
  return <EmptyState why={MARKETS.noLiveWindows.why} />;
}

export function MarketsHero({ market, openingRaw, lanes, resolving, onSelect, onPickLane, ticket }: MarketsHeroProps) {
  return (
    <section className="page-hero markets-hero">
      <span className="crop tl" />
      <span className="crop tr" />
      <span className="crop bl" />
      <span className="crop br" />
      <div className="container">
        <div className="hero-grid hero-grid-mini">
          {market ? (
            <HeroChart market={market} openingRaw={openingRaw} lanes={lanes.laneSet?.lanes ?? []} onPickLane={onPickLane} onSelect={onSelect} />
          ) : (
            <div className="hero-chart mh-hero-empty">
              <HeroPlaceholder lanes={lanes} resolving={resolving} />
            </div>
          )}
          {ticket}
        </div>
      </div>
    </section>
  );
}
