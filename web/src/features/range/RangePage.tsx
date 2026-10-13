"use client";
/** The /games/range island (same shape as /parlay, §3.1, D-071): the screen loads with the late data layer. */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { RANGE } from "./copy";
import "@/styles/parlay.css";
import "@/styles/range.css";
import "@/styles/prediction-ticket.css";

function Placeholder() {
  return (
    <div className="game-page">
      <LoadingState shape="game" label={RANGE.band.waiting} />
    </div>
  );
}

const RangeScreen = dynamic(() => import("./RangeScreen").then((m) => m.RangeScreen), { ssr: false, loading: () => <Placeholder /> });

export function RangePage() {
  return useDataReady() ? <RangeScreen /> : <Placeholder />;
}
