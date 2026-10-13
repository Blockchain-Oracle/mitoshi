"use client";
/**
 * The hero panel (Ported from Owarine 90a91d71:web/src/features/markets/hero/HeroChart.tsx, R4-3 D-227; first ported from
 * Masayume 68f7a09): the question, the chart under it and the call — one object, in Owarine's four parts: the head
 * (`HeroChartHead`), the canvas, the foot (`HeroChartFoot`) and the phone's call (`HeroYesNo`). The chart is the Window
 * as a live picture — the lead before the open, OPEN and CLOSES, the opening print as the line to beat. Price/Depth is a
 * chip on the canvas's corner, so the foot stays Owarine's single row on a phone. The Room and the alerts are the
 * screen's sheets (`onOpenRoom` / `onOpenAlerts`), as Owarine holds `roomMarket` in MarketsScreen.
 */
import type { EventMarket, Lane, MarketId, Side } from "@cwf/core";
import dynamic from "next/dynamic";
import { useState } from "react";
import { DEPTH } from "../copy";
import type { LaneTabKey } from "../data/lane-view";
import { useChartSeries } from "../data/useChartSeries";
import { useTopOfBook } from "../data/useTopOfBook";
import { MarketWindowChart } from "../chart/MarketWindowChart";
import { HeroChartFoot } from "./HeroChartFoot";
import { HeroChartHead } from "./HeroChartHead";
import { HeroYesNo } from "./HeroYesNo";

export interface HeroChartProps {
  market: EventMarket;
  openingRaw: bigint | null;
  lanes: readonly Lane[];
  activeKey: LaneTabKey | null;
  onPickLane: (key: LaneTabKey, marketId: MarketId) => void;
  onSelect: (marketId: MarketId, side: Side) => void;
  onOpenRoom: () => void;
  onOpenAlerts: () => void;
}

// The depth view (21st 29968) is its own island: loaded only when the user switches to it (§3.1).
const HeroDepth = dynamic(() => import("./HeroDepth"), { ssr: false, loading: () => <div className="h-56" /> });

export function HeroChart({ market, openingRaw, lanes, activeKey, onPickLane, onSelect, onOpenRoom, onOpenAlerts }: HeroChartProps) {
  const series = useChartSeries(market);
  const [view, setView] = useState<"price" | "depth">("price");
  const book = useTopOfBook(market);
  const latestRaw = series?.ok ? (series.value.latest?.valueRaw ?? null) : null;

  return (
    <div className="hero-chart">
      <HeroChartHead market={market} openingRaw={openingRaw} currentRaw={latestRaw} lanes={lanes} activeKey={activeKey} onPickLane={onPickLane} />
      <div className="hero-chart-canvas">
        <div className="mh-chart-fill">
          {view === "depth" ? (
            <HeroDepth market={market} />
          ) : (
            <MarketWindowChart market={market} openingRaw={openingRaw} backfill={series?.ok ? series.value.points : undefined} className="h-full w-full" />
          )}
        </div>
        <div className="mh-view" role="group" aria-label={DEPTH.toggle}>
          {(["price", "depth"] as const).map((v) => (
            <button key={v} type="button" className="mh-view-btn" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "price" ? DEPTH.price : DEPTH.depth}
            </button>
          ))}
        </div>
      </div>
      <HeroChartFoot book={book} asset={market.asset} onOpenRoom={onOpenRoom} onOpenAlerts={onOpenAlerts} />
      <HeroYesNo marketId={market.marketId} upCents={book.upCents} downCents={book.downCents} onSelect={onSelect} />
    </div>
  );
}
