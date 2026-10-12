"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/chart/MarketWindowChart.tsx (O-3, D-222) — the live line is the
// asset's display ticks (ops publishes a 24/7 stock's off-hours feed under its own ticker), as on the terminal.
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
      symbol={market.asset}
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
