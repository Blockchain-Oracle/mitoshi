"use client";
/**
 * /markets (Ported from Masayume 68f7a09:web/src/features/markets/{MarketsPage,MarketsScreen}.tsx; restored to Owarine
 * 90a91d71's arrangement — O-3/O-5, D-222): the market you are betting on is the page. The hero carries the question,
 * the live Window chart and the ticket (docked beside it from `lg`, a drawer below); the user's own calls are pinned
 * under it (D-048); §01's lanes change the hero — a card or its UP/DOWN selects that Window here — with the NYSE session
 * beside the heading and the closed stocks under them; §02 says the same Windows in plain words. The terminal is one
 * tap away for the one-tap trader. No clock is read here: countdowns, cards and the board tick as leaves (ux-audit fix
 * 12). Live data: the D-049 stream marks the hero's book, the visible Windows and the wallet's reads stale as events
 * land (`useLiveMarketData`). R4-0 (D-227): one root (`.markets-page`), so the stage always holds a single item —
 * a fragment let a flex stage set the hero and the lanes side by side. R4-3 (D-227), Owarine 90a91d71 MarketsScreen: the
 * Room is one sheet held here (`roomMarket`), opened from the hero or any card (the alerts sheet too); §01 and §02 wear
 * Owarine's compact `SectionHeader` (§01's aside the session chip, no "Live" pill); the word board follows the pinned
 * ticker and says why when the read failed; with no Window the rail is the ticket's own framed placeholder.
 */
import { isAllHoursLane, isOk, type EventMarket, type MarketId, type Side } from "@cwf/core";
import { useLiveMarketData, useOpeningPrice } from "@cwf/markets/react";
import { MotionScope } from "@/components/motion-scope";
import { SectionHeader } from "@/components/shell/SectionHeader";
import { AlertsDrawer, RoomDrawer } from "@/features/terminal/lazy-drawers";
import { closeDrawer, openDrawer, useOpenDrawerName } from "@/lib/drawer-param";
import { useState } from "react";
import { pickWindow } from "@/features/terminal/pick-window";
import { useClockValue } from "@/lib/clock";
import { tapFeedback } from "@/lib/feedback";
import { useWalletSession } from "@/lib/wallet-session";
import { SECTIONS } from "./copy";
import { YourCalls } from "./calls/YourCalls";
import { MarketsAllowance } from "@/features/session/MarketsAllowance";
import { laneTickers, tickerMarkets, type LaneTabKey } from "./data/lane-view";
import { useLanesState } from "./data/useLanesState";
import { useMarketsSelection } from "./data/useSelection";
import { MarketsHero, RailPlaceholder } from "./hero/MarketsHero";
import { CadenceLanes } from "./lanes/CadenceLanes";
import { ClosedStocks } from "./lanes/ClosedStocks";
import { MarketSessionChip } from "./session/MarketSessionChip";
import { TicketDock } from "./ticket/TicketDock";
import { WordMarketBoard } from "./word-board/WordMarketBoard";
import { SenseiDock } from "@/features/sensei/SenseiDock";

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
  // A lane's Windows arrive in index order: the hero takes the one trading now (the terminal's `pickWindow`), else the
  // soonest to open — never a Window listed for tomorrow's bell while today's trade.
  const minute = useClockValue((ms) => Math.floor(ms / 60_000));
  // Unpinned, the hero leads with the lane's first asset — BTC on the 24/7 lanes (D-226) — not whichever Window has the
  // most time left.
  const heroTicker = lanes.ticker ?? (lanes.activeLane ? (laneTickers(lanes.activeLane)[0] ?? null) : null);
  const candidates = lanes.activeLane ? tickerMarkets(lanes.activeLane, heroTicker) : [];
  const fallback = pickWindow(candidates, minute * 60) ?? candidates[0] ?? lanes.activeLane?.markets[0] ?? null;
  const { selection, setSelection } = useMarketsSelection(lanes.laneSet, fallback, routeMarketId);
  const opening = useOpeningPrice(selection.marketId);
  const openingRaw = opening?.ok ? opening.value : (selection.market?.openingPriceRaw ?? null);
  const visible = lanes.activeLane ? tickerMarkets(lanes.activeLane, lanes.ticker).slice(0, 8).map((m) => m.marketId) : [];
  useLiveMarketData({ marketIds: selection.marketId ? [selection.marketId, ...visible] : visible, wallet: address });

  const select = (marketId: MarketId, side?: Side) => {
    tapFeedback();
    setSelection(marketId, side);
  };
  const pickLane = (key: LaneTabKey, marketId: MarketId) => {
    lanes.pin(key);
    setSelection(marketId);
  };
  // One Room and one alerts sheet for the page (Owarine `roomMarket`), in the URL (`?d=room` · `?d=alerts`, D-190): Back
  // closes them. A card opens its own Window's Room; the hero opens the hero's.
  const named = useOpenDrawerName();
  const [roomMarket, setRoomMarket] = useState<EventMarket | null>(null);
  const roomFor = roomMarket ?? selection.market;
  const openRoom = (m: EventMarket | null) => {
    setRoomMarket(m);
    openDrawer("room");
  };
  const closeSheet = () => {
    setRoomMarket(null);
    closeDrawer();
  };
  const failure = lanes.reading && !isOk(lanes.reading) ? lanes.reading.error : null;
  const allHours = lanes.activeLane ? isAllHoursLane(lanes.activeLane.basis) : false;
  const ticket = selection.market ? (
    <TicketDock market={selection.market} side={selection.side} sessionId={selection.sessionId} />
  ) : (
    <RailPlaceholder waiting={lanes.reading === null || selection.resolving} allHours={allHours} />
  );

  return (
    <div className="markets-page">
      <MarketsHero
        market={selection.market}
        openingRaw={openingRaw}
        lanes={lanes}
        resolving={selection.resolving}
        onSelect={select}
        onPickLane={pickLane}
        onOpenRoom={() => openRoom(null)}
        onOpenAlerts={() => openDrawer("alerts")}
        ticket={ticket}
      />
      <div className="markets-main">
        <div className="container">
          <MarketsAllowance />
          <YourCalls />
          <section className="markets-section flex flex-col gap-4" aria-label={SECTIONS.lanes.title}>
            <SectionHeader index={SECTIONS.lanes.index} title={SECTIONS.lanes.title} aside={<MarketSessionChip allHours={allHours} />} />
            <CadenceLanes state={lanes} selectedMarketId={selection.marketId} onSelect={select} onOpenRoom={openRoom} />
            <ClosedStocks laneSet={lanes.laneSet} />
          </section>
          <section id="words" className="markets-section flex flex-col gap-4 scroll-mt-4" aria-label={SECTIONS.words.title}>
            <SectionHeader index={SECTIONS.words.index} title={SECTIONS.words.title} desc={SECTIONS.words.desc} />
            <WordMarketBoard laneSet={lanes.laneSet} ticker={lanes.ticker} failure={failure} onSelect={select} />
          </section>
        </div>
      </div>
      {named === "room" && roomFor ? (
        <RoomDrawer open onOpenChange={(o) => !o && closeSheet()} symbol={roomFor.asset} window={{ marketId: roomFor.marketId, asset: roomFor.asset, intervalSec: roomFor.intervalSec, expirySec: roomFor.expirySec }} />
      ) : null}
      {named === "alerts" && selection.market ? <AlertsDrawer open onOpenChange={(o) => !o && closeSheet()} symbol={selection.market.asset} /> : null}
      {/* The dock rides above the page, as the reference mounts it (Owarine 90a91d71 MarketsScreen L94; O-6). */}
      <SenseiDock laneSet={lanes.laneSet} market={selection.market} openingRaw={openingRaw} address={address} onAct={(id, side) => select(id, side)} />
    </div>
  );
}
