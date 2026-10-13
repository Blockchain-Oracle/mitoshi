"use client";
/**
 * The /markets island: the screen once the late data layer exists (§3.1, D-071) — before that, the hero's exact box as
 * a named wait, so nothing shifts when it lands. Feature stylesheets load with the route, never globally.
 */
import type { MarketId } from "@cwf/core";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { MARKETS } from "./copy";
import { RailFrame } from "./hero/RailFrame";
// The screen is an island that loads with the data layer (§3.1, D-071): the route's first load stays the shell.
const MarketsScreen = dynamic(() => import("./MarketsScreen").then((m) => m.MarketsScreen), { ssr: false, loading: () => <Placeholder /> });
import "@/styles/markets-hero.css";
import "@/styles/markets-hero-fit.css";
import "@/styles/market-card.css";
import "@/styles/word-board.css";
import "@/styles/ticket.css";
import "@/styles/ticket-composer.css";
import "@/styles/ticket-composer-light.css";
import "@/styles/share-card.css";
import "@/styles/claim-winnings.css";
import "@/styles/history.css";
import "@/styles/alerts.css";
import "./markets.css";

/**
 * The page's own outline while the data layer boots (D-226; R4-3 D-227, loading parity): the hero's real boxes — the
 * `.hero-chart` panel and, from `lg`, the framed rail — with their skeletons inside, so the boxes are the same before and
 * after the island lands and no floor height is reserved; then the lane's cards.
 */
function Placeholder() {
  return (
    <div className="markets-page">
      <section className="page-hero markets-hero">
        <div className="container">
          <div className="hero-grid hero-grid-mini">
            <div className="hero-chart mh-hero-empty">
              <LoadingState shape="chart" label={MARKETS.loadingWindows} />
            </div>
            <RailFrame>
              <LoadingState shape="ticket" />
            </RailFrame>
          </div>
        </div>
      </section>
      <div className="markets-main">
        <div className="container">
          <LoadingState shape="cards" />
        </div>
      </div>
    </div>
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
