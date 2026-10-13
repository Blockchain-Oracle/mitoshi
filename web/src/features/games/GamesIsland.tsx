"use client";
// The games' data-reading screens as islands (§3.1, D-071; P4, D-223): the hub and Practice read the venue (lanes, the
// Range reserve), so they load with the late data layer, as /markets does — the route's first load stays the shell.
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";

/** The same placeholder as `app/(app)/games/loading.tsx` draws, so a navigation swaps it once, in place (R4-13a). */
const Wait = () => <div className="container"><LoadingState shape="page" label="Loading" /></div>;
const Hub = dynamic(() => import("./GamesHub").then((m) => m.GamesHub), { ssr: false, loading: Wait });
const Practice = dynamic(() => import("./practice/PracticeStage").then((m) => m.PracticeStage), { ssr: false, loading: Wait });

export function GamesHubIsland() {
  return useDataReady() ? <Hub /> : <Wait />;
}

export function PracticeIsland() {
  return useDataReady() ? <Practice /> : <Wait />;
}
