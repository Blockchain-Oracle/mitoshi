"use client";
/**
 * Where the ticket lives (Ported from Masayume 68f7a09:web/src/features/markets/ticket/TicketDock.tsx): docked beside
 * the hero chart from `lg`, the right-edge slide-over below it (a phone's bottom sheet) — Base UI Drawer, with the CTA
 * in the sheet's pinned footer above the safe area and the keyboard (ux-audit fix 6; R4-2, D-227: `SheetFooter`, and
 * `?d=ticket` so Back closes it without leaving /markets or dropping the composed order). Every tap that selects a Window
 * bumps the selection's `sessionId`, and that opens it; the drawer has no trigger of its own. The ticket body is a lazy
 * island (§3.1) and stays mounted while closed under `<Activity>` so reopening is instant and keeps the composition.
 * R4-3 (D-227, Owarine 90a91d71 TicketDock): the rail ticket wears its frame (`variant="rail"` → `.tk-ticket--rail`).
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
import { RailFrame } from "../hero/RailFrame";

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

  const show = (next: boolean) => {
    setOpen(next);
    if (next) setEverOpened(true);
  };
  useEffect(() => {
    if (hasRail === false && sessionId > 0) {
      setOpen(true);
      setEverOpened(true);
    }
  }, [hasRail, sessionId]);

  if (hasRail === null) return <RailFrame><LoadingState shape="ticket" /></RailFrame>;
  if (hasRail) {
    return (
      <div className="mh-rail">
        <Ticket market={market} side={side} variant="rail" />
      </div>
    );
  }
  const head = (
    <header className="flex items-center justify-between gap-3 pr-12">
      <div className="flex flex-col gap-0.5">
        <span className="type-title text-ink">{market.asset} · {formatCadence(market.intervalSec)}</span>
        <span className="type-caption text-ink-secondary">{TICKET.title}</span>
      </div>
      <Countdown expirySec={market.expirySec} intervalSec={market.intervalSec} className="type-data-lg" />
    </header>
  );
  return (
    <SlideOver open={open} onOpenChange={show} urlKey="ticket">
      <SlideOverContent title={`${TICKET.title} · ${market.asset}`} hideHeading keepMounted={everOpened} fields className="tk-slide-over">
        {everOpened ? (
          <Activity mode={open ? "visible" : "hidden"}>
            <Ticket market={market} side={side} variant="drawer" head={<>{head}<TicketMiniChart market={market} /></>} />
          </Activity>
        ) : null}
      </SlideOverContent>
    </SlideOver>
  );
}
