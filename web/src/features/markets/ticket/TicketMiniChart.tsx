"use client";
// Ported from Masayume 68f7a09:web/src/features/markets/ticket/TicketMiniChart.tsx — the drawer's live chart (on the
// rail the hero chart beside it does this job), drawn once there is a series to draw.
import type { EventMarket } from "@cwf/core";
import { useOpeningPrice } from "@cwf/markets/react";
import { ReadingBoundary } from "@/components/states";
import { useChartSeries } from "../data/useChartSeries";
import { PriceChart } from "../hero/PriceChart";

export function TicketMiniChart({ market }: { market: EventMarket }) {
  const series = useChartSeries(market);
  const opening = useOpeningPrice(market.marketId);
  const openingRaw = opening?.ok ? opening.value : market.openingPriceRaw;
  if (series?.ok && series.value.points.length < 2) return null;
  return (
    <div className="tk-mini-chart">
      <div className="tk-mini-chart-canvas">
        <ReadingBoundary reading={series} shape="chart">
          {(chart) => <PriceChart points={chart.points} openingRaw={openingRaw} className="h-full w-full" />}
        </ReadingBoundary>
      </div>
    </div>
  );
}
