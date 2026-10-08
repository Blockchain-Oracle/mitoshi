"use client";
/**
 * The /markets island: the list once the late data layer exists (§3.1, D-071) — before that, a list-shaped named wait. Feature stylesheets load with the route, never globally.
 */
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
import "@/styles/share-card.css";
import "@/styles/claim-winnings.css";
import "@/styles/history.css";
import "./markets.css";

function Placeholder() {
  return (
    <div className="markets-main">
      <div className="container">
        <LoadingState shape="plate" label={MARKETS.loadingWindows} />
      </div>
    </div>
  );
}

export function MarketsPage() {
  const ready = useDataReady();
  if (!ready) return <Placeholder />;
  return (
    <Suspense fallback={<Placeholder />}>
      <MarketsScreen />
    </Suspense>
  );
}
