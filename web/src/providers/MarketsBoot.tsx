"use client";
// Ported from Masayume 68f7a09:web/src/providers/MarketsBoot.tsx with Agari 03b30ab's `BootNotice` (the boot's failure
// or staleness is announced inside the page, under the fixed chrome). On Tempo the only boot fact is the chain clock
// (pathUSD is pinned, there is one venue): children always render; a failed boot is announced, a stale one ticks.
import type { ClockSync, Reading } from "@cwf/core";
import { keys, useChainClock } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { ErrorState, StaleTick } from "@/components/states";
import { setClockOffset } from "@/lib/clock";

const BootContext = createContext<Reading<ClockSync> | null>(null);

export function MarketsBoot({ children }: { children: ReactNode }) {
  const boot = useChainClock();
  useEffect(() => {
    if (boot?.ok) setClockOffset(boot.value.offsetMs);
  }, [boot]);
  return <BootContext.Provider value={boot}>{children}</BootContext.Provider>;
}

export function useBoot(): Reading<ClockSync> | null {
  return useContext(BootContext);
}

/** A failed boot, or a stale one's tick, at the top of the page. `not-deployed` is never announced here. */
export function BootNotice() {
  const boot = useBoot();
  const queryClient = useQueryClient();
  if (boot && !boot.ok && boot.error.kind !== "not-deployed") {
    const retry = () => void queryClient.invalidateQueries({ queryKey: keys.boot() });
    return (
      <div className="px-gutter py-2 lg:px-gutter-desktop">
        <ErrorState diagnosis={boot.error} retry={retry} />
      </div>
    );
  }
  if (boot?.ok && boot.stale) return <StaleTick asOfMs={boot.asOfMs} reason={boot.staleReason} className="px-gutter py-1 lg:px-gutter-desktop" />;
  return null;
}
