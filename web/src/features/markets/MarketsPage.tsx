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

/** The lanes' own shape while the list loads: their head and two card-sized waits (nothing below shifts after). */
function Placeholder() {
  return (
    <section className="markets-section flex flex-col gap-4" aria-label={SECTIONS.lanes.title}>
      <SectionHead number={SECTIONS.lanes.index} title={SECTIONS.lanes.title} live />
      <LoadingState shape="cards" label={MARKETS.loadingWindows} />
    </section>
  );
}

/**
 * The frame and the header render once, from the HTML on: only what's under them swaps from the wait to the list, so
 * the page's largest text is one node painted at first paint (a header swapped with the list left Lighthouse an LCP
 * node that no longer existed, at the swap's time).
 */
export function MarketsPage() {
  const ready = useDataReady();
  return (
    <div className="markets-main">
      <div className="container">
        <MarketsHead />
        {ready ? (
          <Suspense fallback={<Placeholder />}>
            <MarketsScreen />
          </Suspense>
        ) : (
          <Placeholder />
        )}
      </div>
    </div>
  );
}
