"use client";
/**
 * The slip's legs — the cart of 21st.dev 109 kokonutd/interactive-checkout (E.4), revamped per D-044: each item is a
 * leg (numbered stamp, the Window, the side, its priced chance and the fair-value model beside it), removable, with
 * 109's `AnimatePresence` enter/exit on `m.*` (plain fade under reduced motion). 109's quantity −/+ becomes
 * the per-leg Window stepper (21st 29940, `WindowStepper`) over the live Windows of the leg's lane, so a leg can move
 * to a later round without leaving the slip. Ported beside Masayume 68f7a09:web/src/features/parlay/LegRow.tsx (the
 * numbered stamp, the Up/Down pair, the per-leg probability, the thin-book line on its own row).
 */
import type { Side } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { formatUtc } from "@cwf/core/units";
import type { ParlayRefusalFigures } from "@cwf/markets/parlay";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { WindowStepper } from "@/components/ui/window-stepper";
import { cn } from "@/lib/utils";
import { PARLAY } from "./copy";
import type { LegWindow } from "./data";
import { contracts, formatCents } from "./format";
import { laneKeyOf, useSlip } from "./slip-state";

export interface LegFigures {
  priceRaw: bigint | null;
  fairRaw: bigint | null;
}

function SideToggle({ value, onChange, label }: { value: Side; onChange: (s: Side) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="ps-sides">
      {(["up", "down"] as const).map((s) => {
        const Icon = s === "up" ? ArrowUp : ArrowDown;
        return (
          <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(s)} className={cn("ps-side min-h-touch", `ps-side--${s}`, value === s && "is-on")}>
            <Icon aria-hidden className="size-3.5" />
            {s === "up" ? PARLAY.slip.up : PARLAY.slip.down}
          </button>
        );
      })}
    </div>
  );
}

export function SlipLegs({ windows, figures, refusal }: { windows: readonly LegWindow[]; figures: readonly LegFigures[]; refusal: ParlayRefusalFigures | null }) {
  const slip = useSlip();
  const reduce = useReducedMotion() === true;
  const byId = new Map(windows.map((w) => [w.market.marketId, w]));
  return (
    <ol className="ps-legs" aria-label={PARLAY.slip.legs(slip.legs.length)}>
      <AnimatePresence initial={false}>
        {slip.legs.map((leg, i) => {
          const w = byId.get(leg.marketId) ?? null;
          const lane = windows.filter((x) => laneKeyOf(x) === leg.laneKey && x.model !== null);
          const f = figures[i];
          const thin = refusal?.kind === "thin-book" && refusal.marketId.toLowerCase() === leg.marketId.toLowerCase() ? refusal : null;
          const below = refusal?.kind === "below-fair" && refusal.marketId.toLowerCase() === leg.marketId.toLowerCase() ? refusal : null;
          return (
            <m.li
              key={leg.key}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="ps-leg"
            >
              <div className="ps-leg-head">
                <span className="ps-stamp numbers" aria-hidden>{i + 1}</span>
                <span className="ps-leg-name">
                  {w ? `${w.market.asset} ${formatCadence(w.market.intervalSec)}` : PARLAY.slip.legLeft(i + 1)}
                </span>
                <span className="ps-leg-prob numbers">{f?.priceRaw != null ? formatCents(f.priceRaw) : "—"}</span>
                <button type="button" onClick={() => slip.remove(leg.key)} aria-label={PARLAY.slip.remove(i + 1)} className="ps-remove size-touch">
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              <div className="ps-leg-controls">
                <SideToggle value={leg.side} onChange={(s) => slip.setSide(leg.key, s)} label={`${PARLAY.slip.side} · ${PARLAY.slip.legLeft(i + 1)}`} />
                <WindowStepper
                  className="ps-stepper"
                  label={`${PARLAY.slip.window} · ${PARLAY.slip.legLeft(i + 1)}`}
                  value={leg.marketId}
                  onChange={(id) => {
                    const next = byId.get(id as typeof leg.marketId);
                    if (next) slip.setWindow(leg.key, next);
                  }}
                  firstText={PARLAY.slip.firstWindow}
                  lastText={PARLAY.slip.lastWindow}
                  options={lane.map((x) => ({ id: x.market.marketId, label: formatUtc(x.market.expirySec * 1000, { withSeconds: false }), valueText: `closes ${formatUtc(x.market.expirySec * 1000, { withSeconds: false })} UTC` }))}
                />
              </div>
              {leg.moved ? <p className="ps-note">{PARLAY.slip.moved}</p> : null}
              {thin ? <p className="ps-note ps-note--warn">{PARLAY.cta.thin(i + 1, contracts(thin.filledRaw), contracts(thin.depthRaw))}</p> : null}
              {below ? <p className="ps-note ps-note--warn">{PARLAY.cta.belowFair(i + 1, formatCents(below.priceRaw), formatCents(below.fairRaw))}</p> : null}
              {!thin && !below && f?.fairRaw != null && f.priceRaw != null ? (
                <p className="ps-note">{PARLAY.slip.modelBook(formatCents(f.fairRaw), formatCents(f.priceRaw))}</p>
              ) : null}
            </m.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
