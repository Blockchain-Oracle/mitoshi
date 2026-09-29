"use client";
/**
 * Where the ticket lives (Ported from Masayume 68f7a09:web/src/features/markets/ticket/TicketDock.tsx): docked beside
 * the hero chart from `lg`, the right-edge slide-over below it (owner overlay rule: no bottom sheets) — Base UI Drawer,
 * `swipeDirection="right"`, with the CTA pinned above the safe area (ux-audit fix 6). Every tap that selects a Window
 * bumps the selection's `sessionId`, and that opens it; the drawer has no trigger of its own. The ticket body is a lazy
 * island (§3.1) and stays mounted while closed under `<Activity>` so reopening is instant and keeps the composition.
 */
import type { EventMarket, Side } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import dynamic from "next/dynamic";
import { Activity, useEffect, useState } from "react";
import { Countdown } from "@/components/data";
import { LoadingState } from "@/components/states";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { TICKET } from "../copy";
import { TICKET_RAIL_MIN_WIDTH } from "../data/useSelection";

const Ticket = dynamic(() => import("./Ticket").then((m) => m.Ticket), { ssr: false, loading: () => <LoadingState shape="ticket" /> });
const TicketMiniChart = dynamic(() => import("./TicketMiniChart").then((m) => m.TicketMiniChart), { ssr: false });

const RAIL_QUERY = `(min-width: ${TICKET_RAIL_MIN_WIDTH / 16}rem)`;

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

export function TicketDock({ market, side, sessionId }: { market: EventMarket; side: Side | null; sessionId: number }) {
  const hasRail = useHasRail();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  useEffect(() => {
    if (hasRail === false && sessionId > 0) {
      setOpen(true);
      setEverOpened(true);
    }
  }, [hasRail, sessionId]);

  if (hasRail === null) return <div className="mh-rail max-lg:hidden"><LoadingState shape="ticket" /></div>;
  if (hasRail) {
    return (
      <div className="mh-rail">
        <Ticket market={market} side={side} />
      </div>
    );
  }
  const head = (
    <header className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="type-title text-ink">{market.asset} · {formatCadence(market.intervalSec)}</span>
        <span className="type-caption text-ink-secondary">{TICKET.title}</span>
      </div>
      <Countdown expirySec={market.expirySec} intervalSec={market.intervalSec} className="type-data-lg" />
    </header>
  );
  return (
    <SlideOver open={open} onOpenChange={setOpen}>
      <SlideOverContent title={`${TICKET.title} · ${market.asset}`} hideHeading keepMounted={everOpened} className="tk-slide-over">
        {everOpened ? (
          <Activity mode={open ? "visible" : "hidden"}>
            <Ticket market={market} side={side} head={<>{head}<TicketMiniChart market={market} /></>} />
          </Activity>
        ) : null}
      </SlideOverContent>
    </SlideOver>
  );
}
