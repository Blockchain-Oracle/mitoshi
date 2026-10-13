"use client";
// The launch pages' islands (R4-11, D-227; §3.1, D-071): each screen reads the chain through the late data layer, so it
// loads after first paint (`ssr: false`) and its placeholder holds the place — the route's first load carries none of it.
// R6 money (T07 + T16, D-230): every placeholder is its page's own outline (the board, the token page), never a line.
import dynamic from "next/dynamic";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { studio as studioShape } from "@/components/states/shapes/automate";
import { launchBoard, launchToken } from "@/components/states/shapes/launch";
import "@/styles/launch.css";

/** /launch/<token>'s shape while it loads: the head and its graduation bar, the chart, the facts, the tab rows. */
export function TokenLoading() {
  return <LoadingFrame shape="launch-token" className="lp-token-page">{launchToken()}</LoadingFrame>;
}

/** /launch's shape while it loads: the head stats, the controls, six rows. */
export function BoardLoading() {
  return <LoadingFrame shape="launch-board" className="lp-board-wrap">{launchBoard()}</LoadingFrame>;
}

export const LaunchIsland = dynamic(() => import("./LaunchScreen").then((m) => m.LaunchScreen), { ssr: false, loading: () => <BoardLoading /> });
export const MemeWizardIsland = dynamic(() => import("./MemeWizard").then((m) => m.MemeWizard), { ssr: false, loading: () => <LoadingFrame shape="studio">{studioShape()}</LoadingFrame> });
export const StablecoinWizardIsland = dynamic(() => import("./StablecoinWizard").then((m) => m.StablecoinWizard), { ssr: false, loading: () => <LoadingFrame shape="studio">{studioShape()}</LoadingFrame> });
export const TokenIsland = dynamic(() => import("./TokenScreen").then((m) => m.TokenScreen), { ssr: false, loading: () => <TokenLoading /> });
