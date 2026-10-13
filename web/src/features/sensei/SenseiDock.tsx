"use client";
// Ported from Owarine 90a91d71:web/src/features/sensei/SenseiDock.tsx (O-6, D-222) — the floating seal over /markets: a
// ring draining toward the nearest close (urgent under the wire), three teaser pops, and a tap opens Sensei on the
// Window in the hero (Mitoshi's drawer: consent first, then the chat with the figures read at ask time). The ring and
// the teasers need no model; only the reply does, and an unconfigured brain says so in the thread. R4-0 (D-227): it
// steps aside while it would cover a primary action (`useStepAside`).
import type { Address, EventMarket, LaneSet, Side } from "@cwf/core";
import { countdown } from "@cwf/core/lifecycle";
import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import MitoshiMark from "@/components/shell/MitoshiMark";
import { SenseiDrawer } from "@/features/terminal/lazy-drawers";
import { useCommittedSpot } from "@/features/terminal/live";
import { useClockValue } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { useUrlOverlay } from "@/lib/drawer-param";
import { SENSEI } from "./copy";
import { useStepAside } from "./useStepAside";

/** The ring's geometry, from the reference's `R = 30` on a 72-unit viewBox. */
const R = 30;
const TAU = 2 * Math.PI * R;
const TEASER_FIRST_MS = 3_500;
const TEASER_HOLD_MS = 4_800;
const TEASER_GAP_MS = 4_500;
const TEASER_POPS = 3;

/** Anything on the page can ask for Sensei by firing this. */
export const SENSEI_OPEN_EVENT = "sensei:open";

function useTeaser(open: boolean): number {
  const reduced = useReducedMotion() === true;
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    if (open || reduced) {
      setIndex(-1);
      return;
    }
    let alive = true;
    let pops = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cycle = (delay: number) => {
      timers.push(
        setTimeout(() => {
          if (!alive) return;
          setIndex(pops % SENSEI.teasers.length);
          timers.push(
            setTimeout(() => {
              if (!alive) return;
              setIndex(-1);
              pops += 1;
              if (pops < TEASER_POPS) cycle(TEASER_GAP_MS);
            }, TEASER_HOLD_MS),
          );
        }, delay),
      );
    };
    cycle(TEASER_FIRST_MS);
    return () => {
      alive = false;
      for (const timer of timers) clearTimeout(timer);
    };
  }, [open, reduced]);
  return index;
}

export function SenseiDock({ laneSet, market, openingRaw, address, onAct }: { laneSet: LaneSet | null; market: EventMarket | null; openingRaw: bigint | null; address: Address | null; onAct?: (marketId: EventMarket["marketId"], side: Side) => void }) {
  const [open, setOpen] = useState(false);
  // Sensei lives in the URL while open (`?d=sensei`, D-190; R4-2): Back closes it instead of leaving /markets.
  const url = useUrlOverlay("sensei", open, setOpen);
  const [everOpened, setEverOpened] = useState(false);
  useEffect(() => void (open && setEverOpened(true)), [open]);
  const teaser = useTeaser(open);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sealRef = useRef<HTMLButtonElement>(null);
  const { aside, hush } = useStepAside(wrapRef, sealRef);
  const spot = useCommittedSpot(open && market ? market.asset : null, { seed: false });
  const nowSec = useClockValue((ms) => Math.floor(ms / 1000));

  // `/markets?sensei=1` opens it (the nav's Sensei item), from another page or from this one: a click on such a link
  // here opens the drawer instead of navigating (Owarine 90a91d71 `SenseiDock` L93–114), and the param leaves the URL.
  useEffect(() => {
    const onAsk = () => setOpen(true);
    const url = new URL(window.location.href);
    if (url.searchParams.get("sensei") === "1") {
      setOpen(true);
      url.searchParams.delete("sensei");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const href = new URL((link as HTMLAnchorElement).href, window.location.href);
      if (href.pathname === "/markets" && href.searchParams.get("sensei") === "1" && window.location.pathname === "/markets") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener(SENSEI_OPEN_EVENT, onAsk);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener(SENSEI_OPEN_EVENT, onAsk);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  // The nearest close on the board drives the ring, as on the reference: the venue-aware `countdown` rule.
  const nearest = useMemo(
    () => (laneSet?.lanes ?? []).flatMap((l) => l.markets).filter((m) => m.expirySec > nowSec).sort((a, b) => a.expirySec - b.expirySec)[0] ?? null,
    [laneSet, nowSec],
  );
  const clock = nearest && nowSec > 0 ? countdown(nowSec * 1000, nearest.expirySec, nearest.intervalSec) : null;
  const urgent = clock?.urgent ?? false;
  const fraction = nearest && clock ? Math.max(0, Math.min(1, clock.remainingSec / Math.max(1, nearest.intervalSec))) : 0;
  const askText = teaser >= 0 && !hush ? SENSEI.teasers[teaser]! : null;

  return (
    <>
      <div ref={wrapRef} className="sensei-dock-wrap" data-aside={aside ? "" : undefined}>
        {askText && !open ? (
          <button key={teaser} type="button" className="sensei-teaser" onClick={() => setOpen(true)} aria-label={SENSEI.dockAsk(askText)}>
            {askText}
          </button>
        ) : null}
        <button ref={sealRef} type="button" tabIndex={aside ? -1 : undefined} onClick={() => setOpen(true)} aria-label={SENSEI.dockOpen} aria-expanded={open} className={cn("sensei-dock", urgent && "urgent", open && "is-open")}>
          <span className="sensei-dock-copy">
            <span className="sd-name">
              {SENSEI.dockName} <b>{SENSEI.dockNameEmphasis}</b>
            </span>
          </span>
          <span className="sensei-dock-avatar">
            <svg viewBox="0 0 72 72" className="sensei-dock-ring" aria-hidden>
              <circle cx="36" cy="36" r={R} className="sd-track" />
              <circle cx="36" cy="36" r={R} className="sd-fill" style={{ strokeDasharray: TAU, strokeDashoffset: TAU * (1 - fraction) } as CSSProperties} />
            </svg>
            <MitoshiMark className="sd-avatar-glyph" />
            <span className="sensei-dock-pulse" aria-hidden />
          </span>
        </button>
      </div>
      {open || everOpened ? (
        <SenseiDrawer
          open={open}
          onOpenChange={(o) => !o && url.onOpenChange?.(false)}
          symbol={market?.asset ?? "BTC"}
          market={market}
          spot={spot.price}
          openingRaw={openingRaw}
          positions={[]}
          values={new Map()}
          address={address}
          onAct={onAct}
        />
      ) : null}
    </>
  );
}
