"use client";
// Ported from Agari 03b30ab:web/src/features/markets/reels/{ReelCard,ReelHead,ReelQuestion,ReelChart,ReelCall}.tsx
// (S13 step 9; Masayume's reel CSS, already ported in `styles/reel*.css`). One Window as a framed portrait card: the
// question, the tape, the call. Everything on it is a real read — the round from the live lanes, the line the on-chain
// opening print, the price the terminal's own live feed. The chart is the S10 sparkline (21st 30538) over the Window's
// series, its baseline the line. UP/DOWN open the terminal on that Window with the side picked: nothing trades here.
import { countdown, formatClock, formatCadence, neededMove, type EventMarket } from "@cwf/core";
import { useOpeningPrice } from "@cwf/markets/react";
import Link from "next/link";
import { memo } from "react";
import { Sparkline } from "@/components/ui/sparkline";
import { useChartSeries } from "@/features/markets/data/useChartSeries";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { usd2 } from "@/features/markets/units";
import { useCommittedSpot } from "@/features/terminal/live";
import { useClockValue } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { REELS } from "./copy";

const closesAt = (sec: number) => new Date(sec * 1_000).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit" });
const timeOf = (sec: number) => new Date(sec * 1_000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const tradeHref = (m: { asset: string; marketId: string }, pick?: "up" | "down") => `/trade/${m.asset}?w=${m.marketId}${pick ? `&pick=${pick}` : ""}`;

/** The clock is read here, so the memoised card above holds nothing that ticks. */
function ReelHead({ market }: { market: EventMarket }) {
  const nowSec = useClockValue((ms) => Math.floor(ms / 1000));
  const state = nowSec > 0 ? countdown(nowSec * 1000, market.expirySec, market.intervalSec) : null;
  return (
    <div className="reel-head">
      <div className="reel-ident">
        <AssetDisc asset={market.asset} className="reel-badge" />
        <div>
          <div className="reel-meta">{REELS.settlesOn(market.asset)}</div>
          <div className="reel-submeta">{REELS.round(formatCadence(market.intervalSec), closesAt(market.expirySec))}</div>
        </div>
      </div>
      <div className={cn("reel-clock", state?.urgent && "urgent")}>
        <span className="reel-clock-label">{REELS.closesIn}</span>
        <span className="reel-clock-value">{state ? formatClock(state.remainingSec) : REELS.noClock}</span>
      </div>
    </div>
  );
}

/** How far the live price sits from the line; whether UP is winning comes from core's `neededMove`, not a comparison here. */
function ReelQuestion({ asset, openingRaw, currentRaw }: { asset: string; openingRaw: bigint | null; currentRaw: bigint | null }) {
  const move = openingRaw !== null && currentRaw !== null ? neededMove(currentRaw, openingRaw) : null;
  const above = move?.upNeedsRaw === 0n;
  return (
    <div className="reel-ask">
      <h2 className="reel-question">
        {REELS.holdsAbove(asset)}{" "}
        {openingRaw === null ? <span className="reel-question-pending">{REELS.noLine}</span> : <span className="reel-question-line">{usd2(openingRaw)}</span>}
        <span className="reel-question-mark">?</span>
      </h2>
      <div className="reel-spot">
        <span>{currentRaw === null ? REELS.noLine : usd2(currentRaw)}</span>
        {move && openingRaw !== null && currentRaw !== null ? (
          usd2(above ? currentRaw - openingRaw : move.upNeedsRaw) === "$0.00" ? (
            <span className="reel-distance">{REELS.atLine}</span>
          ) : (
            <span className={cn("reel-distance", above ? "above" : "below")}>
              {above ? "+" : "−"}
              {usd2(above ? currentRaw - openingRaw : move.upNeedsRaw)} {REELS.versusLine}
            </span>
          )
        ) : null}
        <span className="reel-spot-label">{REELS.livePrice}</span>
      </div>
    </div>
  );
}

function ReelChart({ market, openingRaw }: { market: EventMarket; openingRaw: bigint | null }) {
  const series = useChartSeries(market);
  const points = series?.ok ? series.value.points.map((p) => ({ tSec: p.timeSec, priceE8: p.valueRaw })) : [];
  if (points.length < 2) return <p className="reel-chart-holding">{REELS.reading}</p>;
  return <Sparkline points={points} baselineE8={openingRaw} format={usd2} formatTime={timeOf} label={REELS.chart(market.asset)} className="h-full w-full" />;
}

export const ReelCard = memo(function ReelCard({ market, near, closing }: { market: EventMarket; near: boolean; closing: boolean }) {
  // Live reads only for the card on screen and its neighbours; the lane set already carries each opening print.
  const opening = useOpeningPrice(near ? market.marketId : null);
  const spot = useCommittedSpot(near ? market.asset : null, { seed: false });
  const openingRaw = opening?.ok && opening.value !== null ? opening.value : market.openingPriceRaw;
  return (
    <article className="reel-card">
      <div aria-hidden className="reel-grain" />
      <div aria-hidden className="reel-heat" />
      <ReelHead market={market} />
      <ReelQuestion asset={market.asset} openingRaw={openingRaw} currentRaw={spot.priceE8} />
      <div className="reel-chart">{near ? <ReelChart market={market} openingRaw={openingRaw} /> : <p className="reel-chart-holding">{REELS.swipeToRead}</p>}</div>
      <div className="reel-call">
        {closing ? (
          <p className="reel-note">{REELS.closing}</p>
        ) : (
          <div className="reel-call-pair">
            <Link href={tradeHref(market, "up")} className="reel-side up">{REELS.up}</Link>
            <Link href={tradeHref(market, "down")} className="reel-side down">{REELS.down}</Link>
          </div>
        )}
      </div>
    </article>
  );
});
