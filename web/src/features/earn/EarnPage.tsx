"use client";
/** The /earn island (same shape as /games/range, §3.1, D-071): the screen loads with the late data layer, behind the one earn skeleton (R4-7, D-227). */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { EARN } from "./copy";

function Placeholder() {
  return (
    <div className="flex flex-col gap-3">
      <div className="skel h-8 w-48 rounded-md" />
      <div className="skel h-touch w-64 rounded-md" />
      <LoadingState shape="earn" label={EARN.card.loading} />
    </div>
  );
}

const EarnScreen = dynamic(() => import("./EarnScreen").then((m) => m.EarnScreen), { ssr: false, loading: () => <Placeholder /> });

export function EarnPage() {
  return useDataReady() ? <EarnScreen /> : <Placeholder />;
}

/** The route's loading boundary draws this same placeholder, so a navigation swaps it once, in place (R4-13a, D-227). */
export { Placeholder as EarnLoading };
