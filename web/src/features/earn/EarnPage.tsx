"use client";
/** The /earn island (same shape as /games/range, §3.1, D-071): the screen loads with the late data layer. */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";

function Placeholder() {
  return (
    <div className="container px-gutter py-8 lg:px-gutter-desktop">
      <LoadingState shape="plate" />
    </div>
  );
}

const EarnScreen = dynamic(() => import("./EarnScreen").then((m) => m.EarnScreen), { ssr: false, loading: () => <Placeholder /> });

export function EarnPage() {
  return useDataReady() ? <EarnScreen /> : <Placeholder />;
}
