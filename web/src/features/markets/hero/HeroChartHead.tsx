"use client";
/**
 * The hero's head (Ported from Owarine 90a91d71:web/src/features/markets/hero/HeroChartHead.tsx, R4-3 D-227): the asset,
 * the lane length, the session, the question, where it settles, and the clock — everything to read before choosing a
 * side. On a narrow panel the clock moves up beside the asset row and the question takes the full width
 * (markets-hero.css, a container query on `.hero-chart`).
 */
import type { EventMarket, Lane, MarketId } from "@cwf/core";
import { HERO } from "../copy";
import type { LaneTabKey } from "../data/lane-view";
import { SourceLine } from "../price-source/SourceLine";
import { MarketSessionChip } from "../session/MarketSessionChip";
import { AssetDisc } from "./AssetDisc";
import { HeroCadenceTabs } from "./HeroCadenceTabs";
import { HeroQuestion } from "./HeroQuestion";
import { HeroSettlesIn } from "./HeroSettlesIn";

export interface HeroChartHeadProps {
  market: EventMarket;
  openingRaw: bigint | null;
  currentRaw: bigint | null;
  lanes: readonly Lane[];
  activeKey: LaneTabKey | null;
  onPickLane: (key: LaneTabKey, marketId: MarketId) => void;
}

export function HeroChartHead({ market, openingRaw, currentRaw, lanes, activeKey, onPickLane }: HeroChartHeadProps) {
  const source = market.printSource ? (HERO.sources[market.printSource] ?? HERO.sourceUnknown) : HERO.sourceUnknown;
  return (
    <div className="hero-chart-head">
      <div className="mh-head-main">
        <div className="mh-asset-row">
          <AssetDisc asset={market.asset} className="mh-asset-badge" />
          <span className="mh-asset-label">{market.asset}</span>
          <HeroCadenceTabs market={market} lanes={lanes} activeKey={activeKey} onPick={onPickLane} />
          <MarketSessionChip asset={market.asset} basis={market.lane} />
        </div>
        <HeroQuestion asset={market.asset} openingRaw={openingRaw} currentRaw={currentRaw} />
        <SourceLine label={{ text: HERO.source(source), href: null }} className="pair-meta" />
      </div>
      <HeroSettlesIn tradingStartSec={market.tradingStartSec} expirySec={market.expirySec} intervalSec={market.intervalSec} />
    </div>
  );
}
