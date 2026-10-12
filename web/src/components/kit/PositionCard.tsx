"use client";
// Ported from Owarine 90a91d71:web/src/components/kit/PositionCard.tsx (R4-1, folded into the kit by R4-2; D-227) —
// UGLYCASH's position card on Mitoshi's
// tokens: what it is worth now (rolling), the P&L that tones with its sign, the average entry and what is in. "Worth now"
// is what Close pays — the exit, not a mid-price. Money arrives as numbers for the view (bigints upstream); the P&L is
// the caller's when the book prices only part of it (like for like), else worth − invested.
import type { ReactNode } from "react";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import { Odometer } from "./Odometer";

export interface PositionCardProps {
  title: ReactNode;
  side: "up" | "down";
  /** Live exit value in dollars: what Close pays right now; null when nothing prices it (then `why`). */
  value: number | null;
  /** Dollars still in (the open cost). */
  invested: number;
  /** The P&L and its %, when the caller prices it like for like; otherwise worth − invested. */
  pnl?: number | null;
  pct?: number | null;
  /** Why there is no number (locked, no bids). */
  why?: string;
  avgIn: ReactNode;
  meta?: ReactNode;
  labels: { worth: string; avgIn: string; invested: string };
  action?: ReactNode;
  className?: string;
}

export function PositionCard({ title, side, value, invested, pnl: given, pct: givenPct, why, avgIn, meta, labels, action, className }: PositionCardProps) {
  const masked = usePrivacy();
  const pnl = given !== undefined ? given : value === null ? null : value - invested;
  const pct = givenPct !== undefined ? givenPct : pnl !== null && invested > 0 ? (pnl / invested) * 100 : null;
  return (
    <div data-slot="position-card" className={cn("position-card", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate type-body-strong text-ink">{title}</p>
          {meta ? <p className="mt-0.5 type-caption text-ink-secondary">{meta}</p> : null}
        </div>
        <span data-dir={side} className="position-card-side">{side === "up" ? "UP" : "DOWN"}</span>
      </div>
      <p className="mt-4 type-caption text-ink-secondary">{labels.worth}</p>
      <span className="position-card-figure">{masked ? SHELL.masked : value === null ? (why ?? "—") : <Odometer value={value} kind="usd" />}</span>
      {pnl !== null && !masked ? (
        <div className="position-card-pnl">
          <Odometer value={pnl} kind="pnl" decimals={2} />
          {pct !== null ? <Odometer value={pct} kind="pct" /> : null}
        </div>
      ) : null}
      <dl className="position-card-grid">
        <div>
          <dt>{labels.avgIn}</dt>
          <dd>{avgIn}</dd>
        </div>
        <div>
          <dt>{labels.invested}</dt>
          <dd>{masked ? SHELL.masked : <Odometer value={invested} kind="usd" />}</dd>
        </div>
      </dl>
      {action ? <div className="mt-4 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
