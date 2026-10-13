"use client";

// The fixture sections load after the page shell: this page shows every kit piece at once, which would otherwise put the
// whole kit, the desk kit and both overlays in one first load over the route budget (scripts/perf/route-budgets.ts).
import dynamic from "next/dynamic";

const KitFixtures = dynamic(() => import("./KitFixtures").then((m) => m.KitFixtures), { ssr: false });
const OverlayFixtures = dynamic(() => import("./OverlayFixtures").then((m) => m.OverlayFixtures), { ssr: false });
const DeskKitFixtures = dynamic(() => import("./DeskKitFixtures").then((m) => m.DeskKitFixtures), { ssr: false });

export function KitSections() {
  return (
    <>
      <KitFixtures />
      <OverlayFixtures />
      <DeskKitFixtures />
    </>
  );
}
