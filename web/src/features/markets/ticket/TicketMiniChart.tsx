"use client";
// Ported from Masayume 68f7a09:web/src/features/markets/ticket/TicketMiniChart.tsx — the drawer's live chart (on the
// rail the hero chart beside it does this job), now Owarine 90a91d71's Window chart in its compact form (O-4, D-222).
import type { EventMarket } from "@cwf/core";
import { useOpeningPrice } from "@cwf/markets/react";
import { MarketWindowChart } from "../chart/MarketWindowChart";
import { useChartSeries } from "../data/useChartSeries";

export function TicketMiniChart({ market }: { market: EventMarket }) {
  const series = useChartSeries(market);
  const opening = useOpeningPrice(market.marketId);
  const openingRaw = opening?.ok ? opening.value : market.openingPriceRaw;
  return (
    <div className="tk-mini-chart" data-base-ui-swipe-ignore="">
      <div className="tk-mini-chart-canvas">
        <MarketWindowChart market={market} openingRaw={openingRaw} backfill={series?.ok ? series.value.points : undefined} variant="compact" className="h-full w-full" />
      </div>
    </div>
  );
}
