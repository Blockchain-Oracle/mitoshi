"use client";
/**
 * The /surface island (same shape as /parlay and the markets page, §3.1, D-071): the screen loads with the late data
 * layer; before that, a named wait. Its stylesheet loads with the screen, never globally.
 */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { SURFACE } from "./copy";

function Placeholder() {
  return (
    <div className="container px-gutter pl-page lg:px-gutter-desktop">
      <LoadingState shape="page" label={SURFACE.loading} />
    </div>
  );
}

const SurfaceScreen = dynamic(() => import("./SurfaceScreen").then((m) => m.SurfaceScreen), { ssr: false, loading: () => <Placeholder /> });

export function SurfacePage() {
  const ready = useDataReady();
  return ready ? <SurfaceScreen /> : <Placeholder />;
}
