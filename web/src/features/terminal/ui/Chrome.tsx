"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/ui/Chrome.tsx — Mitoshi's tokens (`styles/terminal.css`),
// NumberFlow for the rolling digits (the repo's odometer, components.md), the feed's source named under the asset, the
// Window chip on Mitoshi's lanes (Regular · 24/7 · Gap), the equity pill with "Sign in" (no demo, D-191), and the
// settings stack dragged by pointer events instead of motion's `drag` (no `domMax` in the terminal's load).
import NumberFlow from "@number-flow/react";
import { ArrowDownRight, ArrowUpRight, BadgePercent, ChevronDown, ChevronRight, Coins, Gauge, TrendingDown } from "lucide-react";
import { useRef, type CSSProperties, type PointerEvent } from "react";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { addressHue } from "@/lib/address-hue";
import { tapFeedback } from "@/lib/feedback";
import { SHELL } from "@/lib/copy";
import { priceDecimals } from "../chart/engine";
import { TERMINAL } from "../copy";
import type { TerminalLane } from "../pick-window";

const USD = (dp: number) => ({ style: "currency", currency: "USD", minimumFractionDigits: dp, maximumFractionDigits: dp }) as const;

/** Tradash's asset chip: the disc, the live price rolling ("—" before the first tick), "BTC · Bitcoin" and the feed. */
export function AssetChip({ asset, name, price, feed, stale, connecting, onOpen }: { asset: string; name: string; price: number | null; feed: string; stale: boolean; connecting: boolean; onOpen: () => void }) {
  return (
    <button type="button" className="tm-glass tm-asset" onClick={() => (tapFeedback(), onOpen())} aria-haspopup="dialog">
      <AssetDisc asset={asset} className="tm-disc" />
      <span className="tm-asset-text">
        <span className="tm-asset-price">
          {price === null ? "—" : <NumberFlow value={price} format={USD(priceDecimals(price))} willChange />}
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
export function WindowChip({ lanes, laneKey, onPick, state }: { lanes: readonly TerminalLane[]; laneKey: string | null; onPick: (lane: TerminalLane) => void; state: string }) {
  return (
    <div className="tm-glass tm-window" role="group" aria-label="Window">
      {lanes.map((l) => (
        <button key={l.key} type="button" className="tm-lane" aria-pressed={l.key === laneKey} onClick={() => (tapFeedback(), onPick(l))}>
          {l.label}
        </button>
      ))}
      <span className="tm-window-state" aria-live="off">{state}</span>
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
        <span>{masked ? SHELL.masked : equity === null ? "—" : <NumberFlow value={equity} format={USD(2)} willChange />}</span>
      </button>
    );
  }
  return (
    <button type="button" aria-label={TERMINAL.equity.account} className={`tm-glass tm-equity ${className ?? ""}`} onClick={() => (tapFeedback(), onOpen())}>
      {/* Tradash's loading pill (§8): a 4.5rem skeleton bar and a pulsing avatar until the balance is read. */}
      <span>{masked ? SHELL.masked : equity === null ? <span role="status" aria-label={TERMINAL.equity.loading} className="tm-skel" style={{ width: "4.5rem" }} /> : <NumberFlow value={equity} format={USD(2)} willChange />}</span>
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
  const up = (roiPct ?? 0) >= 0;
  const Dir = up ? ArrowUpRight : ArrowDownRight;
  return (
    <button type="button" className="tm-glass tm-view tm-phone" onClick={() => (tapFeedback(), onOpen())}>
      <span className={`tm-pos-side ${up ? "tm-up-soft" : "tm-down-soft"}`}><Dir aria-hidden strokeWidth={2.75} /></span>
      <span>{TERMINAL.positions.view(count)}</span>
      {roiPct === null ? null : <NumberFlow value={roiPct / 100} format={{ style: "percent", signDisplay: "always", maximumFractionDigits: 1 }} />}
      <ChevronRight aria-hidden className="size-4" />
    </button>
  );
}
