"use client";
// The themes pages' islands (R4-11, D-227; §3.1, D-071): each screen reads the chain through the late data layer, so it
// loads after first paint (`ssr: false`) and its placeholder holds the place — the route's first load carries none of it.
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states/LoadingState";
import "@/styles/themes.css";
import "@/styles/launch.css";

export const THEMES_READING = "Reading the themes";

/** /themes/<id>'s shape while it loads: the head, the Follow pill, the tabs' first panel. */
export function ThemeLoading() {
  return (
    <section className="th-page th-cockpit" aria-busy="true" aria-label="Reading the theme">
      <div className="th-cockpit-head"><span className="lp-skel lp-skel--disc" /><span className="lp-skel lp-skel--line" /></div>
      <span className="lp-skel lp-skel--pill" />
      <div className="lp-chart lp-skel" />
    </section>
  );
}

export const ThemesIsland = dynamic(() => import("./ThemesScreen").then((m) => m.ThemesScreen), { ssr: false, loading: () => <LoadingState shape="cards" label={THEMES_READING} /> });
export const ThemeStudioIsland = dynamic(() => import("./ThemeStudio").then((m) => m.ThemeStudio), { ssr: false, loading: () => <LoadingState shape="studio" /> });
export const ThemeIsland = dynamic(() => import("./ThemeScreen").then((m) => m.ThemeScreen), { ssr: false, loading: () => <ThemeLoading /> });
