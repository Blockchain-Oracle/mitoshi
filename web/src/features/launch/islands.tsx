"use client";
// The launch pages' islands (R4-11, D-227; §3.1, D-071): each screen reads the chain through the late data layer, so it
// loads after first paint (`ssr: false`) and its placeholder holds the place — the route's first load carries none of it.
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states/LoadingState";
import "@/styles/launch.css";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { studio as studioShape } from "@/components/states/shapes/automate";

export const LAUNCH_READING = "Reading the launches";

/** /launch/<token>'s shape while it loads: the head row, the 180 px chart, the progress and the action bar. */
export function TokenLoading() {
  return (
    <section className="lp-page lp-token" aria-busy="true" aria-label="Reading the launch">
      <div className="lp-token-head"><span className="lp-skel lp-skel--disc" /><span className="lp-skel lp-skel--line" /></div>
      <div className="lp-chart lp-skel" />
      <span className="lp-skel lp-skel--line" />
      <div className="lp-action"><span className="lp-skel lp-skel--pill" /><span className="lp-skel lp-skel--pill" /></div>
    </section>
  );
}

export const LaunchIsland = dynamic(() => import("./LaunchScreen").then((m) => m.LaunchScreen), { ssr: false, loading: () => <LoadingState shape="page" label={LAUNCH_READING} /> });
export const MemeWizardIsland = dynamic(() => import("./MemeWizard").then((m) => m.MemeWizard), { ssr: false, loading: () => <LoadingFrame shape="studio">{studioShape()}</LoadingFrame> });
export const StablecoinWizardIsland = dynamic(() => import("./StablecoinWizard").then((m) => m.StablecoinWizard), { ssr: false, loading: () => <LoadingFrame shape="studio">{studioShape()}</LoadingFrame> });
export const TokenIsland = dynamic(() => import("./TokenScreen").then((m) => m.TokenScreen), { ssr: false, loading: () => <TokenLoading /> });
