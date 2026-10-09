"use client";
/**
 * The /markets island: the list once the late data layer exists (§3.1, D-071) — before that, a list-shaped named wait. Feature stylesheets load with the route, never globally.
 */
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { MARKETS, SECTIONS } from "./copy";
import { MarketsHead } from "./MarketsHead";
import SectionHead from "@/components/shell/SectionHead";
// The screen is an island that loads with the data layer (§3.1, D-071): the route's first load stays the shell.
const MarketsScreen = dynamic(() => import("./MarketsScreen").then((m) => m.MarketsScreen), { ssr: false, loading: () => <Placeholder /> });
import "@/styles/markets-hero.css";
import "@/styles/market-card.css";
import "@/styles/word-board.css";
import "@/styles/share-card.css";
import "@/styles/claim-winnings.css";
import "@/styles/history.css";
import "./markets.css";

/** The list's own shape while it loads: its header, the lanes' head and two card-sized waits (nothing shifts after). */
function Placeholder() {
  return (
    <div className="markets-main">
      <div className="container">
        <MarketsHead />
        <section className="markets-section flex flex-col gap-4" aria-label={SECTIONS.lanes.title}>
          <SectionHead number={SECTIONS.lanes.index} title={SECTIONS.lanes.title} live />
          <LoadingState shape="cards" label={MARKETS.loadingWindows} />
        </section>
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
