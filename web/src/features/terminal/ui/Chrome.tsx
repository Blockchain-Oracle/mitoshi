"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/ui/Chrome.tsx — Mitoshi's tokens (`styles/terminal.css`),
// NumberFlow for the rolling digits (the repo's odometer, components.md), the feed's source named under the asset, the
// Window chip on Mitoshi's lanes (Regular · 24/7 · Gap), the equity pill with "Sign in" (no demo, D-191), and the
// settings stack dragged by pointer events instead of motion's `drag` (no `domMax` in the terminal's load). R4-0
// (D-227): the Window's countdown sits outside the lanes' scroller, so seven stock lanes never push it off a phone, and
// a stock with both feeds shows one basis's cadences and a 24/7 switch; the equity goes compact on the narrowest
// phones; an unpriced position's pill shows a clock, not a gain (Owarine 90a91d71 `ViewPositionPill`).
import NumberFlow from "@number-flow/react";
import { ArrowDownRight, ArrowUpRight, BadgePercent, ChevronDown, ChevronRight, Clock, Coins, Gauge, TrendingDown } from "lucide-react";
import { useRef, type CSSProperties, type PointerEvent } from "react";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { addressHue } from "@/lib/address-hue";
import { tapFeedback } from "@/lib/feedback";
import { SHELL } from "@/lib/copy";
import { priceDecimals } from "../chart/engine";
import { TERMINAL } from "../copy";
import { windowChips, type TerminalLane } from "../pick-window";

// NumberFlow formats in the browser's locale unless told: en-GB read "US$997,888.48", two characters wider than the
// "$" every other figure in the app shows (R4-0, D-227), so each one here says en-US.
const USD = (dp: number) => ({ style: "currency", currency: "USD", minimumFractionDigits: dp, maximumFractionDigits: dp }) as const;
const COMPACT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

/** The equity rolling, and the same figure compact ($10K) that the narrowest phones show instead (`terminal.css`). */
function Equity({ value }: { value: number }) {
  return (
    <>
      <span className="tm-equity-full"><NumberFlow locales="en-US" value={value} format={USD(2)} willChange /></span>
      <span className="tm-equity-compact" aria-hidden>{COMPACT.format(value)}</span>
    </>
  );
}

/** Tradash's asset chip: the disc, the live price rolling ("—" before the first tick), "BTC · Bitcoin" and the feed. */
export function AssetChip({ asset, name, price, feed, stale, connecting, onOpen }: { asset: string; name: string; price: number | null; feed: string; stale: boolean; connecting: boolean; onOpen: () => void }) {
  return (
    <button type="button" className="tm-glass tm-asset" onClick={() => (tapFeedback(), onOpen())} aria-haspopup="dialog">
      <AssetDisc asset={asset} className="tm-disc" />
      <span className="tm-asset-text">
        <span className="tm-asset-price">
          {price === null ? "—" : <NumberFlow locales="en-US" value={price} format={USD(priceDecimals(price))} willChange />}
          <ChevronDown aria-hidden />
        </span>
        <span className="tm-asset-name" data-stale={stale ? "" : undefined}>
          {asset} · {name} · {connecting ? TERMINAL.feed.connecting : stale ? TERMINAL.feed.stale : feed}
        </span>
      </span>
    </button>
  );
}

/** The Window chip: which lane (Regular, 24/7, the Gap) and how long this Window has. */
/** `sessionWord` (R4-3): the NYSE state or the halt, folded into the state on a phone (the session cell is desktop's). */
export function WindowChip({ lanes, laneKey, onPick, state, sessionWord = null }: { lanes: readonly TerminalLane[]; laneKey: string | null; onPick: (lane: TerminalLane) => void; state: string; sessionWord?: string | null }) {
  const { shown, toggle } = windowChips(lanes, laneKey);
  return (
    <div className="tm-glass tm-window" role="group" aria-label="Window">
      <div className="tm-lanes">
        {shown.map((l) => (
          <button key={l.key} type="button" className="tm-lane" aria-pressed={l.key === laneKey} onClick={() => (tapFeedback(), onPick(l))}>
            {l.label}
          </button>
        ))}
        {toggle ? (
          <button type="button" className="tm-lane" aria-pressed={toggle.on} onClick={() => (tapFeedback(), onPick(toggle.to))}>
            {TERMINAL.window.allDay}
          </button>
        ) : null}
      </div>
      <span className="tm-window-state" aria-live="off">
        {sessionWord ? <span className="tm-phone">{sessionWord} · </span> : null}
        {state}
      </span>
    </div>
  );
}

/**
 * Tradash's equity pill: equity rolling and the avatar. Signed out it is DEMO's paper equity (Owarine 90a91d71's
 * "DEMO 10,000.00"); a tap moves to a real account. Masked while balances are hidden.
 */
export function EquityPill({ equity, address, masked, onOpen, onSignIn, className }: { equity: number | null; address: string | null; masked: boolean; onOpen: () => void; onSignIn: () => void; className?: string }) {
  if (!address) {
    return (
      <button type="button" aria-label={TERMINAL.equity.demoAria} className={`tm-glass tm-equity ${className ?? ""}`} data-signed-out="" onClick={() => (tapFeedback(), onSignIn())}>
        <span className="tm-demo-tag">{TERMINAL.equity.demo}</span>
        <span>{masked ? SHELL.masked : equity === null ? "—" : <Equity value={equity} />}</span>
      </button>
    );
  }
  return (
    <button type="button" aria-label={TERMINAL.equity.account} className={`tm-glass tm-equity ${className ?? ""}`} onClick={() => (tapFeedback(), onOpen())}>
      {/* Tradash's loading pill (§8): a 4.5rem skeleton bar and a pulsing avatar until the balance is read. */}
      <span>{masked ? SHELL.masked : equity === null ? <span role="status" aria-label={TERMINAL.equity.loading} className="tm-skel" style={{ width: "4.5rem" }} /> : <Equity value={equity} />}</span>
      <span aria-hidden className={`tm-avatar${equity === null && !masked ? " tm-skel-pulse" : ""}`} style={{ "--tm-hue": addressHue(address) } as CSSProperties}>{address.slice(2, 4).toUpperCase()}</span>
    </button>
  );
}

/**
 * Tradash's order-settings stack `se`: flush to the left edge, glass, rows Size · Pays · Fees · Trailing; it peeks in
 * once, drags up and down (pointer events, ±160), and a tap opens the settings drawer (a tap right after a drag is not).
 */
export function SettingsStack({ asset, size, pays, trailing, onOpen }: { asset: string; size: string; pays: string; trailing: string; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ startY: number; base: number; moved: boolean } | null>(null);
  const offset = useRef(0);
  const draggedAt = useRef(0);
  const rows = [
    { icon: Coins, label: TERMINAL.stack.size, value: size },
    { icon: Gauge, label: TERMINAL.stack.pays, value: pays },
    { icon: BadgePercent, label: TERMINAL.stack.fees, value: TERMINAL.stack.free },
    { icon: TrendingDown, label: TERMINAL.stack.trailing, value: trailing },
  ];
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    drag.current = { startY: e.clientY, base: offset.current, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < 4) return;
    d.moved = true;
    offset.current = Math.max(-160, Math.min(160, d.base + dy));
    ref.current?.style.setProperty("--tm-drag", `${offset.current}px`);
  };
  const up = () => {
    if (drag.current?.moved) draggedAt.current = Date.now();
    drag.current = null;
  };
  return (
    <button
      ref={ref}
      type="button"
      aria-label={TERMINAL.stack.label(asset)}
      className="tm-glass tm-stack is-peek"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={() => {
        if (Date.now() - draggedAt.current < 250) return;
        tapFeedback();
        onOpen();
      }}
    >
      {rows.map((r) => (
        <span key={r.label} style={{ display: "contents" }}>
          <span className="tm-stack-icon"><r.icon aria-hidden strokeWidth={2.5} /></span>
          <span className="tm-stack-value"><span className="sr-only">{r.label}: </span>{r.value}</span>
        </span>
      ))}
    </button>
  );
}

/** Phone only: "View position" / "View N positions" with the total ROI, above the trade buttons. */
export function ViewPositionPill({ count, roiPct, onOpen }: { count: number; roiPct: number | null; onOpen: () => void }) {
  const Dir = roiPct === null ? Clock : roiPct >= 0 ? ArrowUpRight : ArrowDownRight;
  const tone = roiPct === null ? "tm-pos-pending" : roiPct >= 0 ? "tm-up-soft" : "tm-down-soft";
  return (
    <button type="button" className="tm-glass tm-view tm-phone" onClick={() => (tapFeedback(), onOpen())}>
      <span className={`tm-pos-side ${tone}`}><Dir aria-hidden strokeWidth={2.75} /></span>
      <span>{TERMINAL.positions.view(count)}</span>
      {roiPct === null ? <span className="tm-view-dash">—</span> : <NumberFlow locales="en-US" value={roiPct / 100} format={{ style: "percent", signDisplay: "always", maximumFractionDigits: 1 }} />}
      <ChevronRight aria-hidden className="size-4" />
    </button>
  );
}
