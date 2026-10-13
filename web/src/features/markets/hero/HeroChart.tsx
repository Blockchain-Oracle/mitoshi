"use client";
/**
 * The hero panel (Ported from Masayume 68f7a09:web/src/features/markets/hero/{HeroChart,HeroChartHead,HeroChartFoot,
 * HeroYesNo}.tsx; restored with Owarine 90a91d71's canvas Window chart, session chip, Room and Alert — O-3, D-222): the
 * question, the chart under it and the call, one object. The chart is the Window as a live picture — the lead before
 * the open, OPEN and CLOSES, the opening print as the line to beat, green above it and red below, a hover readout. The
 * ramp's fill is the UP price, so a bar at 64¢ means UP costs 64¢; an empty side draws nothing and reads "—". Below
 * `lg` the two buttons are the way into the ticket drawer. The Room and the price alerts open the terminal's drawers.
 * R4-0 (D-227), Owarine 90a91d71 `HeroChartHead`/`HeroChartFoot`: the source line sits in the head under the question
 * (`SourceLine className="pair-meta"`), Price/Depth are text tabs in the cadence's own style, and on a phone Sensei is a
 * foot item (its floating seal would cover DOWN there).
 */
import type { EventMarket, Lane, MarketId, Side } from "@cwf/core";
import { Bell, MessageCircle, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { closeDrawer, openDrawer, useOpenDrawerName } from "@/lib/drawer-param";
import { SENSEI } from "@/features/sensei/copy";
import { SENSEI_OPEN_EVENT } from "@/features/sensei/SenseiDock";
import { DEPTH, HERO, HERO_HEAD, MARKETS } from "../copy";
import type { LaneTabKey } from "../data/lane-view";
import { useChartSeries } from "../data/useChartSeries";
import { useTopOfBook } from "../data/useTopOfBook";
import { AssetDisc } from "./AssetDisc";
import { HeroCadenceTabs } from "./HeroCadenceTabs";
import { HeroQuestion } from "./HeroQuestion";
import { HeroSettlesIn } from "./HeroSettlesIn";
import { MarketWindowChart } from "../chart/MarketWindowChart";
import { MarketSessionChip } from "../session/MarketSessionChip";
import { AlertsDrawer, RoomDrawer } from "@/features/terminal/lazy-drawers";

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
  // The Room and Alerts sheets live in the URL (`?d=room` · `?d=alerts`, D-190; R4-2): Back closes them.
  const named = useOpenDrawerName();
  const drawer = named === "room" || named === "alerts" ? named : null;
  const setDrawer = (next: "room" | "alerts" | null) => (next ? openDrawer(next) : closeDrawer());
  const book = useTopOfBook(market);
  const latestRaw = series?.ok ? (series.value.latest?.valueRaw ?? null) : null;
  const source = market.printSource ? (HERO.sources[market.printSource] ?? HERO.sourceUnknown) : HERO.sourceUnknown;

  return (
    <div className="hero-chart">
      <div className="hero-chart-head">
        <div className="mh-head-main">
          <div className="mh-asset-row">
            <AssetDisc asset={market.asset} className="mh-asset-badge" />
            <span className="mh-asset-label">{market.asset}</span>
            <HeroCadenceTabs market={market} lanes={lanes} onPick={onPickLane} />
            <MarketSessionChip asset={market.asset} basis={market.lane} />
          </div>
          <HeroQuestion asset={market.asset} openingRaw={openingRaw} currentRaw={latestRaw} />
          <span className="pair-meta mh-source">{HERO.source(source)}</span>
        </div>
        <HeroSettlesIn tradingStartSec={market.tradingStartSec} expirySec={market.expirySec} intervalSec={market.intervalSec} />
      </div>
      <div className="hero-chart-canvas">
        <div className="mh-chart-fill">
          {view === "depth" ? (
            <HeroDepth market={market} />
          ) : (
            <MarketWindowChart market={market} openingRaw={openingRaw} backfill={series?.ok ? series.value.points : undefined} className="h-full w-full" />
          )}
        </div>
      </div>
      <div className="hero-chart-foot">
        <div className="mh-foot-actions">
          <button type="button" className="mh-room" onClick={() => setDrawer("room")} aria-label={`${HERO_HEAD.room} · ${HERO_HEAD.roomQualifier}`}>
            <MessageCircle className="mh-room-icon" aria-hidden />
            {HERO_HEAD.room}
            <span className="mh-room-meta">{HERO_HEAD.roomQualifier}</span>
          </button>
          <button type="button" className="mh-room" onClick={() => setDrawer("alerts")} aria-label={`${HERO_HEAD.alert} · ${market.asset}`}>
            <Bell className="mh-room-icon" aria-hidden />
            {HERO_HEAD.alert}
          </button>
          <button type="button" className="mh-room mh-sensei" onClick={() => window.dispatchEvent(new Event(SENSEI_OPEN_EVENT))} aria-label={SENSEI.dockOpen}>
            <Sparkles className="mh-room-icon" aria-hidden />
            {SENSEI.dockName}
          </button>
        </div>
        <div className="mh-cadence-tabs mh-view" role="group" aria-label={DEPTH.toggle}>
          {(["price", "depth"] as const).map((v) => (
            <button key={v} type="button" className="mh-cadence" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "price" ? DEPTH.price : DEPTH.depth}
              {view === v ? <span aria-hidden className="mh-cadence-underline" /> : null}
            </button>
          ))}
        </div>
        <span className="ramp" aria-label={HERO_HEAD.upCosts(cents(book.upCents))}>
          <span>{HERO_HEAD.rampUp}</span>
          <span className="bar">
            <span className="fill" style={{ width: `${book.upCents ?? 0}%` }} />
          </span>
          <span className="mh-ramp-cents">{cents(book.upCents)}</span>
        </span>
      </div>
      <div className="hero-yesno page-action" data-primary-action="">
        <button type="button" className="hyn hyn-yes" aria-label={`${HERO_HEAD.betUp} · ${cents(book.upCents)}`} onClick={() => onSelect(market.marketId, "up")}>
          <span className="hyn-label">{MARKETS.up}</span>
          <span className="hyn-price">{cents(book.upCents)}</span>
        </button>
        <button type="button" className="hyn hyn-no" aria-label={`${HERO_HEAD.betDown} · ${cents(book.downCents)}`} onClick={() => onSelect(market.marketId, "down")}>
          <span className="hyn-label">{MARKETS.down}</span>
          <span className="hyn-price">{cents(book.downCents)}</span>
        </button>
      </div>
      {drawer === "room" ? (
        <RoomDrawer open onOpenChange={(o) => !o && setDrawer(null)} symbol={market.asset} window={{ marketId: market.marketId, asset: market.asset, intervalSec: market.intervalSec, expirySec: market.expirySec }} />
      ) : null}
      {drawer === "alerts" ? <AlertsDrawer open onOpenChange={(o) => !o && setDrawer(null)} symbol={market.asset} /> : null}
    </div>
  );
}
