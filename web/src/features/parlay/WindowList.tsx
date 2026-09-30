"use client";
/**
 * The live Windows a leg may name — the product list of 21st.dev 109 kokonutd/interactive-checkout (E.4 "109 legs
 * list"), revamped per D-044: each row is a Window (asset, cadence, its line, when it closes) with the two sides as
 * the "Add" buttons; adding flies a chip to the slip along 24524's arc (`useFlyToTarget`). Replaces Masayume's
 * per-leg dropdown picker (`LegRow.tsx`), which hid the Windows behind a 12 px chevron. Changed from 109: no product
 * images, no cart beside it (the slip is its own rail / slide-over), `m.*` entrance only for rows that appear, 44 px
 * buttons with the side word and an arrow (colour is never the only signal), and Windows the reserve can't price —
 * no fair-value model for their lane — are listed apart, disabled, with the reason.
 */
import type { Side } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { Countdown } from "@/components/data";
import { EmptyState, LoadingState } from "@/components/states";
import { useFlyToTarget } from "@/components/ui/fly-to-target";
import { cn } from "@/lib/utils";
import { usd0 } from "../markets/units";
import { PARLAY } from "./copy";
import type { LegWindow } from "./data";
import { useSlip } from "./slip-state";

/** The visible slip target: the rail's leg count from `lg`, the dock button below it. */
function slipTarget(): Element | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>("[data-slip-target]"));
  return all.find((el) => el.offsetParent !== null) ?? null;
}

function Row({ w, nowMs }: { w: LegWindow; nowMs: number }) {
  const slip = useSlip();
  const fly = useFlyToTarget();
  const reduce = useReducedMotion() === true;
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const m0 = w.market;
  const held = slip.legs.find((l) => l.marketId === m0.marketId);
  const full = !held && slip.legs.length >= slip.maxLegs;
  const tap = (side: Side) => {
    if (full) return;
    slip.add(w, side);
    void fly((side === "up" ? upRef : downRef).current, slipTarget(), `${m0.asset} ${side === "up" ? "▲" : "▼"}`);
  };
  const sideButton = (side: Side) => {
    const on = held?.side === side;
    const Icon = side === "up" ? ArrowUp : ArrowDown;
    return (
      <button
        ref={side === "up" ? upRef : downRef}
        type="button"
        onClick={() => tap(side)}
        disabled={full}
        aria-pressed={on}
        aria-label={PARLAY.windows.add(side === "up" ? PARLAY.slip.up : PARLAY.slip.down, `${m0.asset} ${formatCadence(m0.intervalSec)}`)}
        className={cn("pw-side min-h-touch", side === "up" ? "pw-side--up" : "pw-side--down", on && "is-on")}
      >
        {on ? <Check aria-hidden className="size-4" /> : <Icon aria-hidden className="size-4" />}
        <span>{side === "up" ? PARLAY.slip.up : PARLAY.slip.down}</span>
      </button>
    );
  };
  return (
    <m.li layout={reduce ? false : "position"} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }} className={cn("pw-row", held && "is-held")}>
      <div className="pw-main">
        <span className="pw-name">
          {m0.asset} <span className="pw-cadence">{formatCadence(m0.intervalSec)}</span>
        </span>
        <span className="pw-meta">
          {PARLAY.windows.line} {m0.openingPriceRaw !== null ? usd0(m0.openingPriceRaw) : PARLAY.windows.linePending} · {PARLAY.windows.closesIn}{" "}
          <Countdown expirySec={m0.expirySec} intervalSec={m0.intervalSec} nowMs={nowMs} />
        </span>
        {held ? <span className="pw-held">{PARLAY.windows.inSlip}</span> : full ? <span className="pw-held">{PARLAY.windows.full(slip.maxLegs)}</span> : null}
      </div>
      <div className="pw-sides">
        {sideButton("up")}
        {sideButton("down")}
      </div>
    </m.li>
  );
}

export function WindowList({ windows, loading, nowMs }: { windows: readonly LegWindow[]; loading: boolean; nowMs: number }) {
  const priced = windows.filter((w) => w.model !== null);
  const unpriced = windows.filter((w) => w.model === null);
  if (loading && windows.length === 0) return <LoadingState shape="row" label={PARLAY.windows.loading} />;
  if (windows.length === 0) return <EmptyState why={PARLAY.windows.none} />;
  return (
    <div className="pw">
      <ul className="pw-list" aria-label={PARLAY.windows.title}>
        <AnimatePresence initial={false}>
          {priced.map((w) => (
            <Row key={w.market.marketId} w={w} nowMs={nowMs} />
          ))}
        </AnimatePresence>
      </ul>
      {priced.length === 0 ? <p className="pw-none">{PARLAY.windows.noModel}</p> : null}
      {unpriced.length > 0 ? (
        <details className="pw-unpriced">
          <summary className="min-h-touch">{PARLAY.windows.unpricedTitle(unpriced.length)}</summary>
          <p className="pw-none">{PARLAY.windows.noModel}</p>
          <ul className="pw-list pw-list--muted">
            {unpriced.map((w) => (
              <li key={w.market.marketId} className="pw-row pw-row--muted">
                <span className="pw-name">
                  {w.market.asset} <span className="pw-cadence">{formatCadence(w.market.intervalSec)}</span>
                </span>
                <span className="pw-meta">
                  {PARLAY.windows.closesIn} <Countdown expirySec={w.market.expirySec} intervalSec={w.market.intervalSec} nowMs={nowMs} />
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
