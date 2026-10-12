"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/chart/MarketWindowChart.tsx (O-3, D-222) — "a 24/7 stock Window
// follows … the price it settles on": the line is the Window's own signed feed (`useChartSeries`: history, then every
// signed tick from the stream), never the terminal's display ticks — a second source a few cents away zigzags the line.
import type { EventMarket } from "@cwf/core";
import { useMemo } from "react";
import { HERO } from "../copy";
import type { ChartPoint } from "../data/useChartSeries";
import { WindowChart } from "./WindowChart";

export interface MarketWindowChartProps {
  market: EventMarket;
  /** The opening print on the print scale; null while it is pending. */
  openingRaw: bigint | null;
  /** The Window's recorded prints (`useChartSeries`), drawn wherever the live series has not started. */
  backfill?: readonly ChartPoint[];
  variant?: "full" | "compact";
  className?: string;
}

/** A Window on the chart: its open and close, its opening print, and the live line of the spot it settles on. */
export function MarketWindowChart({ market, openingRaw, backfill, variant = "full", className }: MarketWindowChartProps) {
  const times = useMemo(() => ({ openMs: market.tradingStartSec * 1000, closeMs: market.expirySec * 1000 }), [market.tradingStartSec, market.expirySec]);
  return (
    <WindowChart
      asset={market.asset}
      symbol={null}
      live
      times={times}
      referenceRaw={openingRaw}
      referenceLabel={HERO.openingPrint}
      backfill={backfill}
      variant={variant}
      className={className}
      label={`${market.asset} price chart for this Window`}
    />
  );
}
