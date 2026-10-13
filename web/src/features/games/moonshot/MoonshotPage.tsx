"use client";
/** The /games/moonshot island (§3.1, D-071). */
import dynamic from "next/dynamic";
import { useDataReady } from "@/providers/data/context";
import { MOONSHOT } from "./copy";
import "@/styles/parlay.css";
import "@/styles/range.css";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { game as gameShape } from "@/components/states/shapes/games";

function Placeholder() {
  return (
    <div className="game-page">
      <LoadingFrame shape="game" label={MOONSHOT.ticket.pricing}>{gameShape()}</LoadingFrame>
    </div>
  );
}

const MoonshotScreen = dynamic(() => import("./MoonshotScreen").then((m) => m.MoonshotScreen), { ssr: false, loading: () => <Placeholder /> });

export function MoonshotPage() {
  return useDataReady() ? <MoonshotScreen /> : <Placeholder />;
}

/** The route's loading boundary draws this same placeholder, so a navigation swaps it once, in place (R4-13a, D-227). */
export { Placeholder as MoonshotLoading };
