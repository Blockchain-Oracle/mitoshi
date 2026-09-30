"use client";
/**
 * The hero panel (Ported from Masayume 68f7a09:web/src/features/markets/hero/{HeroChart,HeroChartHead,HeroChartFoot,
 * HeroYesNo}.tsx): the question, the chart under it and the call, one object. The ramp's fill is the UP price, so a bar
 * at 64¢ means UP costs 64¢; an empty side draws nothing and reads "—". Below `lg` the two buttons are the way into
 * the ticket slide-over. The Room (bettors only) is the social stage's; its control says so in place.
 */
import type { EventMarket, Lane, MarketId, Side } from "@cwf/core";
import { MessageCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ReadingBoundary } from "@/components/states";
import { DEPTH, HERO, HERO_HEAD, MARKETS } from "../copy";
import type { LaneTabKey } from "../data/lane-view";
import { useChartSeries } from "../data/useChartSeries";
import { useTopOfBook } from "../data/useTopOfBook";
import { AssetDisc } from "./AssetDisc";
import { HeroCadenceTabs } from "./HeroCadenceTabs";
import { HeroQuestion } from "./HeroQuestion";
import { HeroSettlesIn } from "./HeroSettlesIn";
import { PriceChart } from "./PriceChart";

export interface HeroChartProps {
  market: EventMarket;
  openingRaw: bigint | null;
  lanes: readonly Lane[];
  onPickLane: (key: LaneTabKey, marketId: MarketId) => void;
  onSelect: (marketId: MarketId, side: Side) => void;
}

// The depth view (21st 29968) is its own island: loaded only when the user switches to it (§3.1).
const HeroDepth = dynamic(() => import("./HeroDepth"), { ssr: false, loading: () => <div className="h-56" /> });

const cents = (c: number | null) => (c === null ? HERO_HEAD.noPrice : `${c}¢`);

export function HeroChart({ market, openingRaw, lanes, onPickLane, onSelect }: HeroChartProps) {
  const series = useChartSeries(market);
  const [view, setView] = useState<"price" | "depth">("price");
  const book = useTopOfBook(market);
  const latestRaw = series?.ok ? (series.value.latest?.valueRaw ?? null) : null;
  const source = market.printSource ? (HERO.sources[market.printSource] ?? HERO.sourceUnknown) : HERO.sourceUnknown;

  return (
    <div className="hero-chart">
      <div className="hero-chart-head">
        <div>
          <div className="mh-asset-row">
            <AssetDisc asset={market.asset} className="mh-asset-badge" />
            <span className="mh-asset-label">{market.asset}</span>
            <HeroCadenceTabs market={market} lanes={lanes} onPick={onPickLane} />
          </div>
          <HeroQuestion asset={market.asset} openingRaw={openingRaw} currentRaw={latestRaw} />
        </div>
        <HeroSettlesIn tradingStartSec={market.tradingStartSec} expirySec={market.expirySec} intervalSec={market.intervalSec} />
      </div>
      <div className="flex justify-end px-1">
        <SegmentedControl label={DEPTH.toggle} value={view} onValueChange={setView} options={[{ value: "price", label: DEPTH.price }, { value: "depth", label: DEPTH.depth }]} />
      </div>
      <div className="hero-chart-canvas">
        <div className="mh-chart-fill">
          {view === "depth" ? (
            <HeroDepth market={market} />
          ) : (
            <ReadingBoundary reading={series} shape="chart">
              {(chart) => <PriceChart points={chart.points} openingRaw={openingRaw} interactive className="h-full w-full" />}
            </ReadingBoundary>
          )}
        </div>
      </div>
      <p className="px-1 type-caption text-ink-muted">{HERO.source(source)}</p>
      <div className="hero-chart-foot">
        <div className="mh-foot-actions">
          <button type="button" className="mh-room" disabled title={HERO_HEAD.roomPending} aria-label={`${HERO_HEAD.room} — ${HERO_HEAD.roomPending}`}>
            <MessageCircle className="mh-room-icon" aria-hidden />
            {HERO_HEAD.room}
            <span className="mh-room-meta">{HERO_HEAD.roomQualifier}</span>
          </button>
        </div>
        <span className="ramp" aria-label={HERO_HEAD.upCosts(cents(book.upCents))}>
          <span>{HERO_HEAD.rampUp}</span>
          <span className="bar">
            <span className="fill" style={{ width: `${book.upCents ?? 0}%` }} />
          </span>
          <span className="mh-ramp-cents">{cents(book.upCents)}</span>
        </span>
      </div>
      <div className="hero-yesno">
        <button type="button" className="hyn hyn-yes" aria-label={`${HERO_HEAD.betUp} · ${cents(book.upCents)}`} onClick={() => onSelect(market.marketId, "up")}>
          <span className="hyn-label">{MARKETS.up}</span>
          <span className="hyn-price">{cents(book.upCents)}</span>
        </button>
        <button type="button" className="hyn hyn-no" aria-label={`${HERO_HEAD.betDown} · ${cents(book.downCents)}`} onClick={() => onSelect(market.marketId, "down")}>
          <span className="hyn-label">{MARKETS.down}</span>
          <span className="hyn-price">{cents(book.downCents)}</span>
        </button>
      </div>
    </div>
  );
}
