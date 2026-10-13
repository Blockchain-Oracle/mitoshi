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
// The screen is an island that loads with the data layer (§3.1, D-071): the route's first load stays the shell.
const MarketsScreen = dynamic(() => import("./MarketsScreen").then((m) => m.MarketsScreen), { ssr: false, loading: () => <Placeholder /> });
import "@/styles/markets-hero.css";
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

/** The page's own outline while the data layer boots (D-226): the hero beside its ticket, then the lane's cards. */
function Placeholder() {
  return (
    <div className="flex flex-col gap-10">
      <LoadingState shape="hero" label={MARKETS.loadingWindows} />
      <LoadingState shape="cards" />
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

/** The route's loading boundary draws this same placeholder, so a navigation swaps it once, in place (R4-13a, D-227). */
export { Placeholder as MarketsLoading };
