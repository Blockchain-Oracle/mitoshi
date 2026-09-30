"use client";
/** The /games/moonshot island (§3.1, D-071). */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { MOONSHOT } from "./copy";
import "@/styles/parlay.css";
import "@/styles/range.css";
import "@/styles/prediction-ticket.css";

function Placeholder() {
  return (
    <div className="container px-gutter pl-page lg:px-gutter-desktop">
      <LoadingState shape="plate" label={MOONSHOT.ticket.pricing} />
    </div>
  );
}

const MoonshotScreen = dynamic(() => import("./MoonshotScreen").then((m) => m.MoonshotScreen), { ssr: false, loading: () => <Placeholder /> });

export function MoonshotPage() {
  return useDataReady() ? <MoonshotScreen /> : <Placeholder />;
}
