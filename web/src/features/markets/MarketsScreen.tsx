"use client";
/**
 * /markets (Ported from Masayume 68f7a09:web/src/features/markets/{MarketsPage,MarketsScreen}.tsx): the market you are
 * betting on is the page — the hero carries the question, the chart and the ticket; the user's own calls are pinned
 * under it (D-048); the lanes below change the hero; §02 says the same Windows in plain words. No clock is read here:
 * countdowns, cards and the board tick as leaves (ux-audit fix 12). Live data: the D-049 stream marks the hero's book,
 * the visible Windows and the wallet's reads stale as events land (`useLiveMarketData`).
 */
import type { MarketId, Side } from "@cwf/core";
import { useLiveMarketData, useOpeningPrice } from "@cwf/markets/react";
import { MotionScope } from "@/components/motion-scope";
import SectionHead from "@/components/shell/SectionHead";
import { useWalletSession } from "@/lib/wallet-session";
import { SECTIONS } from "./copy";
import { YourCalls } from "./calls/YourCalls";
import { MarketsAllowance } from "@/features/session/MarketsAllowance";
import { tickerMarkets, type LaneTabKey } from "./data/lane-view";
import { useLanesState } from "./data/useLanesState";
import { useMarketsSelection } from "./data/useSelection";
import { MarketsHero } from "./hero/MarketsHero";
import { CadenceLanes } from "./lanes/CadenceLanes";
import { TicketDock } from "./ticket/TicketDock";
import { WordMarketBoard } from "./word-board/WordMarketBoard";

/** The motion scope rides inside the island, so motion's runtime never enters the route's first load (§3.1). */
export function MarketsScreen(props: { routeMarketId?: MarketId | null }) {
  return (
    <MotionScope>
      <Screen {...props} />
    </MotionScope>
  );
}

function Screen({ routeMarketId = null }: { routeMarketId?: MarketId | null }) {
  const { address } = useWalletSession();
  const lanes = useLanesState();
  const fallback = lanes.activeLane ? (tickerMarkets(lanes.activeLane, lanes.ticker)[0] ?? lanes.activeLane.markets[0] ?? null) : null;
  const { selection, setSelection } = useMarketsSelection(lanes.laneSet, fallback, routeMarketId);
  const opening = useOpeningPrice(selection.marketId);
  const openingRaw = opening?.ok ? opening.value : (selection.market?.openingPriceRaw ?? null);
  const visible = lanes.activeLane ? tickerMarkets(lanes.activeLane, lanes.ticker).slice(0, 8).map((m) => m.marketId) : [];
  useLiveMarketData({ marketIds: selection.marketId ? [selection.marketId, ...visible] : visible, wallet: address });

  const select = (marketId: MarketId, side?: Side) => setSelection(marketId, side);
  const pickLane = (key: LaneTabKey, marketId: MarketId) => {
    lanes.pin(key);
    setSelection(marketId);
  };

  return (
    <>
      <MarketsHero
        market={selection.market}
        openingRaw={openingRaw}
        lanes={lanes}
        resolving={selection.resolving}
        onSelect={select}
        onPickLane={pickLane}
        ticket={selection.market ? <TicketDock market={selection.market} side={selection.side} sessionId={selection.sessionId} /> : null}
      />
      <div className="markets-main">
        <div className="container">
          <MarketsAllowance />
          <YourCalls />
          <section className="markets-section flex flex-col gap-4" aria-label={SECTIONS.lanes.title}>
            <SectionHead number={SECTIONS.lanes.index} title={SECTIONS.lanes.title} live />
            <CadenceLanes state={lanes} selectedMarketId={selection.marketId} onSelect={select} />
          </section>
          <section id="words" className="markets-section flex flex-col gap-4 scroll-mt-4" aria-label={SECTIONS.words.title}>
            <SectionHead number={SECTIONS.words.index} title={SECTIONS.words.title} desc={SECTIONS.words.desc} />
            <WordMarketBoard laneSet={lanes.laneSet} onSelect={select} />
          </section>
        </div>
      </div>
    </>
  );
}
