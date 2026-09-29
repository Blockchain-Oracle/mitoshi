"use client";
// Ported from Masayume 68f7a09:web/src/components/data/useNowMs.ts — now a leaf reader of the ONE shared clock
// (`lib/clock.ts`; ux-audit fix 12, R2): every countdown shares one interval per tab instead of one each, and the
// clock stops while the tab is hidden (the shared store only ticks while something subscribes and the tab is visible).
import { useNowMs as useSharedNowMs } from "@/lib/clock";

/** The chain-corrected now (0 before the first client tick), or `externalNowMs` when a parent supplies its own. */
export function useNowMs(externalNowMs?: number): number {
  const shared = useSharedNowMs();
  return externalNowMs ?? shared;
}
