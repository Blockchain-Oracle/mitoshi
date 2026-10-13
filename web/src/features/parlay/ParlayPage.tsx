"use client";
/**
 * The /parlay island (same shape as the markets page, §3.1, D-071): the screen loads with the late data layer; before
 * that, the page's own outline (R6 T18: its head, the Window rows, the slip from the desk), in its own frame. The feature's stylesheets load with the route, never globally.
 */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states/LoadingState";
import { useDataReady } from "@/providers/data/context";
import { PARLAY } from "./copy";
import "@/styles/parlay.css";
import "@/styles/range.css";

function Placeholder() {
  return (
    <div className="game-page pl-page">
      <LoadingState shape="parlay" layout="contents" label={PARLAY.windows.loading} />
    </div>
  );
}

const ParlayScreen = dynamic(() => import("./ParlayScreen").then((m) => m.ParlayScreen), { ssr: false, loading: () => <Placeholder /> });

export function ParlayPage() {
  const ready = useDataReady();
  return ready ? <ParlayScreen /> : <Placeholder />;
}

/** The route's loading boundary draws this same placeholder, so a navigation swaps it once, in place (R4-13a, D-227). */
export { Placeholder as ParlayLoading };
