"use client";
/**
 * The page hero (Ported from Masayume 68f7a09:web/src/features/markets/MarketsHero.tsx; Owarine 90a91d71 MarketsHero and
 * TicketPlaceholder, R4-3 D-227): the market you are betting on is the page — the question, the chart and the ticket as
 * one object; the lanes below change it. Three faces before a Window exists: loading, broken, genuinely empty — each in
 * the hero's own boxes (`.hero-chart` and, from `lg`, the framed rail), so nothing shifts when the Window lands. No crop
 * marks (R4-0): inside the stage they drew a bracket over the chart head; the stage's edge is the frame.
 */
import type { Diagnosis, EventMarket, MarketId, Side } from "@cwf/core";
import { isOk } from "@cwf/core";
import { diagnosisCopy } from "@cwf/core/copy";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/states";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { marketsHero as marketsHeroShape, marketsRail as marketsRailShape } from "@/components/states/shapes/markets";
import { MARKETS, TICKET } from "../copy";
import type { LaneTabKey } from "../data/lane-view";
import type { LanesState } from "../data/useLanesState";
import { MarketSessionChip } from "../session/MarketSessionChip";
import { HeroChart } from "./HeroChart";
import { RailFrame } from "./RailFrame";
import { ReadFailure } from "@/components/states/ReadFailure";

export interface MarketsHeroProps {
  market: EventMarket | null;
  openingRaw: bigint | null;
  lanes: LanesState;
  resolving: boolean;
  onSelect: (marketId: MarketId, side?: Side) => void;
  onPickLane: (key: LaneTabKey, marketId: MarketId) => void;
  onOpenRoom: () => void;
  onOpenAlerts: () => void;
  ticket: ReactNode;
}

/** Broken or genuinely empty, in the hero's box. (Loading is the card's own outline — see `MarketsHero`.) */
function HeroPlaceholder({ lanes }: { lanes: LanesState }) {
  if (lanes.reading !== null && !isOk(lanes.reading)) return <ReadFailure diagnosis={lanes.reading.error} retry={lanes.retry} shape="chart" />;
  return <EmptyState why={MARKETS.noLiveWindows.why} />;
}

/**
 * The rail with no Window to call (Owarine 90a91d71 `TicketPlaceholderView`, D-086): the ticket's own framed panel,
 * saying what the ticket would say and when the market runs — or the ticket's skeleton while the venue is read. A failed
 * read says that it failed (R4-3 review), never "No live Windows", which nobody has read.
 */
export function RailPlaceholder({ waiting, allHours, failure = null }: { waiting: boolean; allHours: boolean; failure?: Diagnosis | null }) {
  return (
    <RailFrame>
      {waiting ? (
        <LoadingFrame shape="markets-rail" layout="contents" label={MARKETS.loadingWindows}>{marketsRailShape()}</LoadingFrame>
      ) : (
        <>
          <span className="tk-amount-label">{TICKET.title}</span>
          <p className="type-body text-ink">{failure ? diagnosisCopy(failure.kind, "read").headline : MARKETS.noLiveWindows.why}</p>
          <MarketSessionChip allHours={allHours} />
        </>
      )}
    </RailFrame>
  );
}

export function MarketsHero({ market, openingRaw, lanes, resolving, onSelect, onPickLane, onOpenRoom, onOpenAlerts, ticket }: MarketsHeroProps) {
  return (
    <section className="page-hero markets-hero">
      <div className="container">
        <div className="hero-grid hero-grid-mini">
          {market ? (
            <HeroChart market={market} openingRaw={openingRaw} lanes={lanes.laneSet?.lanes ?? []} activeKey={lanes.activeKey} onPickLane={onPickLane} onSelect={onSelect} onOpenRoom={onOpenRoom} onOpenAlerts={onOpenAlerts} />
          ) : lanes.reading === null || resolving ? (
            // The route's own outline (MarketsPage `Placeholder`), box for box, so the boot skeleton hands over to this
            // one without a change — it was a flat chart bone in `.mh-hero-empty`, a visible swap for ~3 s on a cold load.
            <LoadingFrame shape="markets-hero" layout="contents" label={MARKETS.loadingWindows}>{marketsHeroShape()}</LoadingFrame>
          ) : (
            <div className="hero-chart mh-hero-empty">
              <HeroPlaceholder lanes={lanes} />
            </div>
          )}
          {ticket}
        </div>
      </div>
    </section>
  );
}
