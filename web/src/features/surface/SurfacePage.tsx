"use client";
/**
 * The /surface island (same shape as /parlay and the markets page, §3.1, D-071): the screen loads with the late data
 * layer; before that, a surface-shaped wait (R4-11, D-227): the chips, four tiles and a 220 px plate. Its stylesheet loads
 * with the screen, never globally.
 */
import dynamic from "next/dynamic";
import { useDataReady } from "@/providers/data/context";
import { SURFACE } from "./copy";
import "@/styles/surface.css";

function Placeholder() {
  return (
    <div className="sf-page" aria-busy="true" aria-label={SURFACE.loading}>
      <header className="sf-head"><h1 className="type-display text-ink">{SURFACE.title}</h1></header>
      <div className="sf-chips"><span className="sf-skel sf-skel--chip" /><span className="sf-skel sf-skel--chip" /><span className="sf-skel sf-skel--chip" /></div>
      <div className="sf-tiles">{[0, 1, 2, 3].map((i) => <span key={i} className="sf-skel sf-skel--tile" />)}</div>
      <span className="sf-skel sf-box--chart" />
    </div>
  );
}

const SurfaceScreen = dynamic(() => import("./SurfaceScreen").then((m) => m.SurfaceScreen), { ssr: false, loading: () => <Placeholder /> });

export function SurfacePage() {
  const ready = useDataReady();
  return ready ? <SurfaceScreen /> : <Placeholder />;
}
