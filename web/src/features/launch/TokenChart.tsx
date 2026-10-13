"use client";
// A memecoin's chart (R6 money, S02; D-230): candles from the coin's own indexed trades (`candlesFromTrades`, curve and
// graduated pool alike — buckets with no trade are not invented) on the 20107 candle chart, with the interval chips
// 1m · 5m · 1h · 1d. Every state is the feed's: reading (the chart's own grid, shimmering), failed (the error with
// Retry), the index behind this launch (a named wait), no trades yet (why, and Buy first), or the candles.
import { candlesFromTrades, type LaunchFeedWire } from "@cwf/core";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Pill } from "@/components/kit/Pill";
import { EmptyState, StateFrame } from "@/components/states/EmptyState";
import { WaitingText } from "@/components/states/WaitingText";
import { CandleChart } from "@/components/ui/candle-chart";
import { RangeSelector } from "@/components/ui/chart-engine";
import { LAUNCH } from "./copy";
import type { FeedState } from "./feed-state";
import { priceText, usdShort } from "./format";

const K = LAUNCH.token;
const timeText = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const priceFmt = (n: number) => priceText(BigInt(Math.round(n * 1e18)));
const volFmt = (n: number) => usdShort(BigInt(Math.round(n * 1e6)));

export function TokenChart({ feed, state, symbol, onRetry, onBuy }: { feed: LaunchFeedWire | null; state: FeedState; symbol: string; onRetry: () => void; onBuy: () => void }) {
  const [interval, setStep] = useState<string>(K.intervals[1].label);
  const ms = K.intervals.find((i) => i.label === interval)?.ms ?? K.intervals[1].ms;
  const candles =
    state === "ready" && feed
      ? candlesFromTrades(feed.trades.map((t) => ({ atSec: t.atSec, priceE18: BigInt(t.priceE18), quoteBase: BigInt(t.quoteBase) })), ms).map((c) => ({
          t: c.t, o: Number(c.o) / 1e18, h: Number(c.h) / 1e18, l: Number(c.l) / 1e18, c: Number(c.c) / 1e18, v: Number(c.v) / 1e6,
        }))
      : [];
  return (
    <section className="lp-chart" aria-label={K.chart.title(symbol)}>
      <div className="lp-chart-head">
        <RangeSelector ranges={K.intervals.map((i) => i.label)} value={interval} onChange={setStep} label={K.intervalLabel} />
      </div>
      <div className="lp-chart-box">
        {state === "loading" ? (
          <div className="lp-chart-wait" role="status" aria-busy="true" aria-label={K.chart.title(symbol)}>
            {[0, 1, 2, 3].map((i) => <span key={i} className="lp-chart-rule" />)}
          </div>
        ) : state === "error" ? (
          <StateFrame size="inline" tone="warning" role="alert" icon={<TriangleAlert />} title={K.tradesError} className="lp-chart-state" actions={<Pill tone="ink" size="sm" onClick={onRetry}>{LAUNCH.retry}</Pill>} />
        ) : state === "indexing" ? (
          <div className="lp-chart-state"><WaitingText onRetry={onRetry}>{K.indexing}</WaitingText></div>
        ) : state === "empty" ? (
          <EmptyState size="inline" why={K.tradesEmpty} nextAction={{ label: K.buyFirst, onClick: onBuy }} className="lp-chart-state" />
        ) : (
          <CandleChart candles={candles} labels={{ ...K.chart, title: K.chart.title(symbol) }} priceFmt={priceFmt} volumeFmt={volFmt} timeFmt={timeText} className="lp-cc" />
        )}
      </div>
    </section>
  );
}
