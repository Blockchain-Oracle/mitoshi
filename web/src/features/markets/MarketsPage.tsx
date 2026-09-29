"use client";
/**
 * The /markets island: the screen once the late data layer exists (§3.1, D-071) — before that, the hero's exact box as
 * a named wait, so nothing shifts when it lands. Feature stylesheets load with the route, never globally.
 */
import type { MarketId } from "@cwf/core";
import { Suspense } from "react";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { MARKETS } from "./copy";
import { MarketsScreen } from "./MarketsScreen";
import "@/styles/markets-hero.css";
import "@/styles/market-card.css";
import "@/styles/word-board.css";
import "@/styles/ticket.css";
import "@/styles/ticket-composer.css";
import "@/styles/ticket-composer-light.css";
import "@/styles/share-card.css";
import "@/styles/claim-winnings.css";
import "@/styles/history.css";
import "./markets.css";

function Placeholder() {
  return (
    <section className="page-hero markets-hero">
      <div className="container">
        <div className="hero-grid hero-grid-mini">
          <div className="hero-chart mh-hero-empty">
            <LoadingState shape="chart" label={MARKETS.loadingWindows} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function MarketsPage({ routeMarketId = null }: { routeMarketId?: MarketId | null }) {
  const ready = useDataReady();
  if (!ready) return <Placeholder />;
  return (
    <Suspense fallback={<Placeholder />}>
      <MarketsScreen routeMarketId={routeMarketId} />
    </Suspense>
  );
}
