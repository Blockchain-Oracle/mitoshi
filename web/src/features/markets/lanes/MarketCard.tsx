"use client";
/**
 * One live Window in the reference's chart-card language (Ported from Masayume 68f7a09:web/src/features/markets/lanes/
 * MarketCard.tsx, `Market624Card`), with 21st.dev 22249 ssychui/market-snapshot's price roll and spark readout (E.1; 2537 as
 * layout reference only — its gradients and shimmer not taken): the question over the opening print, the live price against that line, the spark,
 * the ramp and UP/DOWN at the top of the real book. An unread side shows nothing, never an even 50¢.
 */
import type { EventMarket, MarketId, Side } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { phase } from "@cwf/core/lifecycle";
import { formatWallClock } from "@cwf/core/units";
import { Countdown } from "@/components/data";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useClockValue } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { HERO_HEAD, LANE_CARD, MARKETS } from "../copy";
import { useChartSeries } from "../data/useChartSeries";
import type { TopOfBook } from "../data/useTopOfBook";
import { AssetDisc } from "../hero/AssetDisc";
import { usd0 } from "../units";
import { CardSpark } from "./CardSpark";

/** The book's top arrives as plain values from the lane page's one subscription (D-184). */
interface MarketCardProps extends TopOfBook {
  market: EventMarket;
  selected: boolean;
  onSelect: (marketId: MarketId, side?: Side) => void;
}

const price = (value: number | null, hydrating: boolean) => (value === null ? (hydrating ? LANE_CARD.priceLoading : HERO_HEAD.noPrice) : `${value}¢`);

export function MarketCard({ market, selected, onSelect, upCents, downCents, hydrating }: MarketCardProps) {
  // The phase, not the second: the card re-renders when its Window changes phase; its countdown ticks as its own leaf (D-181).
  const p = useClockValue((nowMs) => (nowMs > 0 ? phase(market, nowMs) : null));
  const reduce = useReducedMotion() === true;
  const series = useChartSeries(market);
  const openingRaw = market.openingPriceRaw;
  const points = series?.ok ? series.value.points : [];
  const latestRaw = series?.ok ? (series.value.latest?.valueRaw ?? null) : null;
  const listed = p === "upcoming";
  const closing = p !== null && p !== "trading" && !listed && p !== "pendingOpeningPrint";
  const open = () => onSelect(market.marketId);

  return (
    <article
      className="market-card"
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
          {listed ? LANE_CARD.opensAt(formatWallClock(market.tradingStartSec * 1000)) : <Countdown expirySec={market.expirySec} intervalSec={market.intervalSec} />}
        </span>
      </div>
      {listed ? (
        // Owarine 90a91d71 `ListedCard` (O-5): a Window listed for the next open is a scheduled call, said so — not an
        // empty question over a price that isn't its own yet.
        <div className="mc-body mc-listed">
          <span className="mc-listed-dot" aria-hidden />
          <p className="type-caption text-ink-secondary">
            <span className="type-body-strong text-ink">{LANE_CARD.schedule(formatWallClock(market.tradingStartSec * 1000))}</span> {LANE_CARD.scheduleLine}
          </p>
        </div>
      ) : (
      <div className="mc-body">
        <div className="mc-question">
          {HERO_HEAD.holdsAbove(market.asset)}{" "}
          {openingRaw === null ? <span className="strike-loading">···</span> : <>{usd0(openingRaw)}?<span className="strike-dot" aria-hidden /></>}
        </div>
        <div className="mc-pricebar">
          <div className="px">
            {/* 22249's price roll: the figure slides as it changes (a plain swap under reduced motion). */}
            <span className="big mc-roll" aria-live="off">
              <AnimatePresence mode="popLayout" initial={false}>
                <m.span key={latestRaw === null ? "none" : usd0(latestRaw)} initial={reduce ? false : { opacity: 0, y: "0.25em" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  {latestRaw === null ? HERO_HEAD.noPrice : usd0(latestRaw)}
                </m.span>
              </AnimatePresence>
            </span>
            {openingRaw !== null && latestRaw !== null && (
              <span className={cn("chg", latestRaw >= openingRaw ? "up" : "down")}>
                {latestRaw >= openingRaw ? "+" : "−"}
                {usd0(latestRaw >= openingRaw ? latestRaw - openingRaw : openingRaw - latestRaw)}
              </span>
            )}
          </div>
        </div>
        <div className="mc-spark">
          <CardSpark points={points} openingRaw={openingRaw} />
        </div>
        <div className="mc-strip">
          {closing ? (
            <span>{LANE_CARD.closing}</span>
          ) : (
            <>
              <span>{upCents === null ? LANE_CARD.oddsLoading : LANE_CARD.oddsLive}</span>
              <span className="ramp">
                <span>{HERO_HEAD.rampUp}</span>
                <span className="bar">{upCents !== null && <span className="fill" style={{ width: `${upCents}%` }} />}</span>
                <span className="pct">{price(upCents, hydrating)}</span>
              </span>
            </>
          )}
        </div>
      </div>
      )}
      {listed ? (
        <div className="mc-foot">
          <button type="button" className="mc-side mc-schedule" onClick={(event) => { event.stopPropagation(); onSelect(market.marketId); }}>
            <span>{LANE_CARD.scheduleCta}</span>
            <span className="price">{LANE_CARD.scheduleMeta}</span>
          </button>
        </div>
      ) : !closing && (
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
    </article>
  );
}
