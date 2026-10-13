"use client";
/** The /earn island (same shape as /games/range, §3.1, D-071): the screen loads with the late data layer, behind the one earn skeleton (R4-7, D-227). */
import dynamic from "next/dynamic";
import { Skeleton, T } from "@/components/states/shapes/bones";
import "./earn.css";
import { useDataReady } from "@/providers/data/context";
import { EARN } from "./copy";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { earn as earnShape } from "@/components/states/shapes/money";

/** R6 (T18): the page's own frame (its head, the four tabs) and the earn outline — the action card with its chip row. */
function Placeholder() {
  return (
    <div className="earn-page">
      <div className="ea-head"><T>Earn the spread.</T></div>
      <div className="ea-tabs flex gap-5">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-13 rounded-md" />)}
      </div>
      <LoadingFrame shape="earn" label={EARN.card.loading}>{earnShape()}</LoadingFrame>
    </div>
  );
}

const EarnScreen = dynamic(() => import("./EarnScreen").then((m) => m.EarnScreen), { ssr: false, loading: () => <Placeholder /> });

export function EarnPage() {
  return useDataReady() ? <EarnScreen /> : <Placeholder />;
}

/** The route's loading boundary draws this same placeholder, so a navigation swaps it once, in place (R4-13a, D-227). */
export { Placeholder as EarnLoading };
