"use client";
// Ported from Masayume 68f7a09:web/src/providers/MarketsBoot.tsx with Agari 03b30ab's `BootNotice` (the boot's failure
// or staleness is announced inside the page, under the fixed chrome). On Tempo the only boot fact is the chain clock
// (pathUSD is pinned, there is one venue); it is read by the late data layer (`data/DataRuntime`) and published here:
// children always render; a failed boot is announced, a stale one ticks.
import type { ClockSync, Reading } from "@cwf/core";
import { keys } from "@cwf/markets/react";
import dynamic from "next/dynamic";
import { StaleTick } from "@/components/states/StaleTick";
import { useDataLayer } from "./data/context";

// Shown only when the boot read fails, so its button and class merging stay out of the first load (§3.1).
const ErrorState = dynamic(() => import("@/components/states/ErrorState").then((m) => m.ErrorState));

export function useBoot(): Reading<ClockSync> | null {
  return useDataLayer().boot;
}

/** A failed boot, or a stale one's tick, at the top of the page. `not-deployed` is never announced here. */
export function BootNotice() {
  const { boot, client } = useDataLayer();
  if (boot && !boot.ok && boot.error.kind !== "not-deployed") {
    const retry = () => void client?.invalidateQueries({ queryKey: keys.boot() });
    return (
      <div className="px-gutter py-2 lg:px-gutter-desktop">
        <ErrorState diagnosis={boot.error} retry={retry} />
      </div>
    );
  }
  if (boot?.ok && boot.stale) return <StaleTick asOfMs={boot.asOfMs} reason={boot.staleReason} className="px-gutter py-1 lg:px-gutter-desktop" />;
  return null;
}
