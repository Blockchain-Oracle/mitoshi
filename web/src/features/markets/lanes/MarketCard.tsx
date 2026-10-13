"use client";
/**
 * One live Window in the reference's chart-card language (Ported from Masayume 68f7a09:web/src/features/markets/lanes/
 * MarketCard.tsx, `Market624Card`), with 21st.dev 22249 ssychui/market-snapshot's price roll and spark readout (E.1; 2537 as
 * layout reference only — its gradients and shimmer not taken): the question over the opening print, the live price against that line, the spark,
 * the ramp and UP/DOWN at the top of the real book. An unread side shows nothing, never an even 50¢.
 * R4-3 (D-227), Owarine 90a91d71 `MarketCardView`: the Room strip under every card (`onOpenRoom`; the screen holds the
 * sheet), an empty read book says "NO QUOTES YET" instead of reading forever, a Window waiting for its opening print has
 * no UP/DOWN, a listed Window is `ListedCard`, the selected card wears the accent ring and flashes once when it becomes
 * the hero, and the line and its move use `usdLine` (cents under $10,000, so the question and the distance agree).
 */
import type { EventMarket, MarketId, Side } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { phase } from "@cwf/core/lifecycle";
import { Countdown } from "@/components/data";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useClockValue } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { HERO_HEAD, LANE_CARD, MARKETS } from "../copy";
import { useChartSeries } from "../data/useChartSeries";
import type { TopOfBook } from "../data/useTopOfBook";
import { AssetDisc } from "../hero/AssetDisc";
import { usdLine } from "../units";
import { CardSpark } from "./CardSpark";
import { ListedCard } from "./ListedCard";

/** The book's top arrives as plain values from the lane page's one subscription (D-184). */
interface MarketCardProps extends TopOfBook {
  market: EventMarket;
  selected: boolean;
  onSelect: (marketId: MarketId, side?: Side) => void;
  /** Opens this Window's Room; the screen holds the sheet. A surface without one (the stock hub) shows no strip. */
  onOpenRoom?: (market: EventMarket) => void;
}

/** Owarine part-06's `.flash` for 1.6 s when a card becomes the hero (not on first paint). */
function useFlash(selected: boolean): boolean {
  const [on, setOn] = useState(false);
  const was = useRef(selected);
  useEffect(() => {
    if (selected && !was.current) {
      setOn(true);
      const t = window.setTimeout(() => setOn(false), 1_600);
      was.current = selected;
      return () => window.clearTimeout(t);
    }
    was.current = selected;
  }, [selected]);
  return on;
}

const price = (value: number | null, hydrating: boolean) => (value === null ? (hydrating ? LANE_CARD.priceLoading : HERO_HEAD.noPrice) : `${value}¢`);

export function MarketCard(props: MarketCardProps) {
  const p = useClockValue((nowMs) => (nowMs > 0 ? phase(props.market, nowMs) : null));
  // Every future round names its opening time (Owarine): a listed Window is the pending card that schedules a call.
  if (p === "upcoming") return <ListedCard market={props.market} selected={props.selected} onSelect={props.onSelect} />;
  return <LiveCard {...props} />;
}

function LiveCard({ market, selected, onSelect, onOpenRoom, upCents, downCents, hydrating }: MarketCardProps) {
  // The phase, not the second: the card re-renders when its Window changes phase; its countdown ticks as its own leaf (D-181).
  const p = useClockValue((nowMs) => (nowMs > 0 ? phase(market, nowMs) : null));
  const reduce = useReducedMotion() === true;
  const series = useChartSeries(market);
  const openingRaw = market.openingPriceRaw;
  const points = series?.ok ? series.value.points : [];
  const latestRaw = series?.ok ? (series.value.latest?.valueRaw ?? null) : null;
  const closing = p !== null && p !== "trading";
  const flash = useFlash(selected);
  const open = () => onSelect(market.marketId);

  return (
    <article
      className={cn("market-card", flash && "flash")}
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      aria-label={LANE_CARD.openTicket(market.asset)}
      onClick={open}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
    >
      <div className="mc-head">
        <span className="mc-asset">
          <AssetDisc asset={market.asset} className="glyph" />
          <span className="mc-ticker">{market.asset}</span>
          <span className="mc-cadence">{formatCadence(market.intervalSec)}</span>
          {market.lane === "stock24" || market.lane === "crypto24" ? <span className="mc-kind">{market.lane === "crypto24" ? LANE_CARD.kindCrypto : LANE_CARD.kind247}</span> : null}
        </span>
        <span className="mc-countdown">
          <span className="clock-dot" aria-hidden />
          <Countdown expirySec={market.expirySec} intervalSec={market.intervalSec} />
        </span>
      </div>
      <div className="mc-body">
        <div className="mc-question">
          {HERO_HEAD.holdsAbove(market.asset)}{" "}
          {openingRaw === null ? <span className="strike-loading">···</span> : <>{usdLine(openingRaw)}?<span className="strike-dot" aria-hidden /></>}
        </div>
        <div className="mc-pricebar">
          <div className="px">
            {/* 22249's price roll: the figure slides as it changes (a plain swap under reduced motion). */}
            <span className="big mc-roll" aria-live="off">
              <AnimatePresence mode="popLayout" initial={false}>
                <m.span key={latestRaw === null ? "none" : usdLine(latestRaw, openingRaw ?? latestRaw)} initial={reduce ? false : { opacity: 0, y: "0.25em" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  {latestRaw === null ? HERO_HEAD.noPrice : usdLine(latestRaw, openingRaw ?? latestRaw)}
                </m.span>
              </AnimatePresence>
            </span>
            {openingRaw !== null && latestRaw !== null && (
              <span className={cn("chg", latestRaw >= openingRaw ? "up" : "down")}>
                {latestRaw >= openingRaw ? "+" : "−"}
                {usdLine(latestRaw >= openingRaw ? latestRaw - openingRaw : openingRaw - latestRaw, openingRaw)}
              </span>
            )}
          </div>
        </div>
        <div className="mc-spark">
          <CardSpark points={points} openingRaw={openingRaw} />
        </div>
        <div className="mc-strip">
          {closing ? (
            <span>{p === "pendingOpeningPrint" ? LANE_CARD.pendingPrint : LANE_CARD.closing}</span>
          ) : (
            <>
              <span>{upCents !== null ? LANE_CARD.oddsLive : hydrating || downCents !== null ? LANE_CARD.oddsLoading : LANE_CARD.noQuotes}</span>
              <span className="ramp">
                <span>{HERO_HEAD.rampUp}</span>
                <span className="bar">{upCents !== null && <span className="fill" style={{ width: `${upCents}%` }} />}</span>
                <span className="pct">{price(upCents, hydrating)}</span>
              </span>
            </>
          )}
        </div>
      </div>
      {!closing && (
        <div className="mc-foot">
          {(["up", "down"] as const).map((side) => (
            <button
              key={side}
              type="button"
              className={`mc-side ${side}`}
              aria-label={`${side === "up" ? HERO_HEAD.betUp : HERO_HEAD.betDown} · ${market.asset} · ${price(side === "up" ? upCents : downCents, hydrating)}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(market.marketId, side);
              }}
            >
              <span>{side === "up" ? MARKETS.up : MARKETS.down}</span>
              <span className="price">{price(side === "up" ? upCents : downCents, hydrating)}</span>
            </button>
          ))}
        </div>
      )}
      {/* The reference's Room strip, live — the one control inside the card that is not the ticket trigger. */}
      {onOpenRoom ? <button
        type="button"
        className="mc-room"
        onClick={(event) => {
          event.stopPropagation();
          onOpenRoom(market);
        }}
      >
        <span className="mc-room-label">{HERO_HEAD.room}</span>
        <span className="mc-room-hint">{HERO_HEAD.roomQualifier}</span>
      </button> : null}
    </article>
  );
}
