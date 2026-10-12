"use client";
/**
 * Where the slip lives (E.4: "31360 drawer (`swipeDirection="right"`)"): the sticky rail beside the Windows from `lg`,
 * the right-edge slide-over below it (owner overlay rule — no bottom sheets), opened from a dock pinned above the
 * safe area that names the slip ("Slip · 2 legs") and is where an added leg's chip lands (`data-slip-target`). The
 * composition lives in `SlipProvider`, so closing the slide-over loses nothing. Same shape as the markets ticket's
 * `TicketDock` (S4).
 */
import type { ParlayReserveState } from "@cwf/core";
import { Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { LoadingState } from "@/components/states";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { PARLAY } from "./copy";
import type { LegWindow } from "./data";
import { ParlaySlip } from "./ParlaySlip";
import { useSlip } from "./slip-state";

const RAIL_QUERY = "(min-width: 64rem)";

function useHasRail(): boolean | null {
  const [hasRail, setHasRail] = useState<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia(RAIL_QUERY);
    const sync = () => setHasRail(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return hasRail;
}

function SlipHead() {
  const { legs, maxLegs } = useSlip();
  return (
    <header className="ps-head">
      <span className="ps-head-title">
        <Layers aria-hidden className="size-4 text-accent" />
        {PARLAY.slip.title}
      </span>
      <span className="ps-count numbers" data-slip-target aria-label={PARLAY.slip.legs(legs.length)}>
        {legs.length}/{maxLegs}
      </span>
    </header>
  );
}

export function SlipDock({ reserve, windows }: { reserve: ParlayReserveState; windows: readonly LegWindow[] }) {
  const hasRail = useHasRail();
  const { legs } = useSlip();
  const [open, setOpen] = useState(false);
  if (hasRail === null) return <div className="pl-rail max-lg:hidden"><LoadingState shape="ticket" /></div>;
  if (hasRail) {
    return (
      <aside className="pl-rail" aria-label={PARLAY.slip.title}>
        <SlipHead />
        <ParlaySlip reserve={reserve} windows={windows} />
      </aside>
    );
  }
  return (
    <>
      <div className="pl-dock">
        <button type="button" className="pl-dock-btn min-h-touch" data-slip-target onClick={() => setOpen(true)} aria-haspopup="dialog">
          <Layers aria-hidden className="size-4" />
          <span>{PARLAY.slip.dock(legs.length, "")}</span>
          <span className="pl-dock-open">{PARLAY.slip.open}</span>
        </button>
      </div>
      <SlideOver open={open} onOpenChange={setOpen}>
        <SlideOverContent title={PARLAY.slip.title} description={PARLAY.slip.legs(legs.length)} fields>
          <ParlaySlip reserve={reserve} windows={windows} />
        </SlideOverContent>
      </SlideOver>
    </>
  );
}
