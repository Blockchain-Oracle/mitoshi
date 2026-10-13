"use client";
// Ported from Masayume 68f7a09:web/src/providers/MarketsBoot.tsx with Agari 03b30ab's `BootNotice` (the boot's failure
// or staleness is announced inside the page, under the fixed chrome). On Tempo the only boot fact is the chain clock
// (pathUSD is pinned, there is one venue); it is read by the late data layer (`data/DataRuntime`) and published here:
// children always render. A failed boot read is the top line's connection strip (R6 shell S04: BootNotice's card above
// the page is gone; one notice per page).
import type { ClockSync, Reading } from "@cwf/core";
import { useDataLayer } from "./data/context";

export function useBoot(): Reading<ClockSync> | null {
  return useDataLayer().boot;
}
