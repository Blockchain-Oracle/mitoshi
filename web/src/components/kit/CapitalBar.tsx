"use client";
// From 21st.dev 35046 kuratlielia/usage-meter, revamped per D-044 for R4-2 (D-227; earn spec step 2): the segmented bar
// that breaks a whole into what takes it, on the portfolio money card's bar grammar (`.money-hero-bar`: 12 px, 4 px
// gaps, rounded). Its motion springs, rolling counter and blur swaps are dropped — segments ease their width in CSS (off
// under reduced motion) and the figures are the caller's. Money stays in base units: shares are integer basis points of
// `totalBase`. An optional cap draws a tick (`capBps`); legend chips filter (aria-pressed) when `onFilter` is given.
// The bar is a meter for assistive tech, read as words.
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface CapitalSegment {
  id: string;
  label: string;
  valueBase: bigint;
  /** A CSS colour by token (`var(--color-accent)`), or a token holding a pattern (an idle hatch). */
  color: string;
  /** After the amount in the legend (R6 money: the committed leg's share, "3.8%"). */
  extra?: string;
  /** Its legend chip is a label, not a filter (idle capital has no rows to show; R4-7). */
  fixed?: boolean;
}

export interface CapitalBarProps {
  segments: readonly CapitalSegment[];
  /** The whole the segments are shares of (base units); defaults to their sum. */
  totalBase?: bigint;
  /** A cap as basis points of the whole (the reserve's limit): drawn as a tick. */
  capBps?: number;
  /** Formats a base-unit amount for the legend and the meter's words. */
  format: (base: bigint) => string;
  label: string;
  /** Legend chips filter the page by segment (aria-pressed). Without it the legend is plain text. */
  onFilter?: (id: string | null) => void;
  active?: string | null;
  className?: string;
}

const BPS = 10_000n;

export function CapitalBar({ segments, totalBase, capBps, format, label, onFilter, active = null, className }: CapitalBarProps) {
  const sum = segments.reduce((n, s) => n + (s.valueBase > 0n ? s.valueBase : 0n), 0n);
  const whole = totalBase && totalBase > 0n ? totalBase : sum;
  const share = (base: bigint) => (whole > 0n && base > 0n ? Number((base * BPS) / whole) : 0);
  const words = segments.map((s) => `${s.label} ${format(s.valueBase)}`).join(", ");
  return (
    <div className={cn("kit-capital", className)}>
      <div className="kit-capital-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={Number(BPS)} aria-valuenow={share(sum)} aria-valuetext={`${words} of ${format(whole)}`}>
        {segments.map((s) => {
          const bps = share(s.valueBase);
          return bps > 0 ? <span key={s.id} className="kit-capital-seg" data-dim={active && active !== s.id ? "" : undefined} style={{ "--kit-share": bps / 100, background: s.color } as CSSProperties} title={`${s.label} · ${format(s.valueBase)}`} /> : null;
        })}
        {capBps !== undefined && capBps > 0 && capBps < Number(BPS) ? <span aria-hidden className="kit-capital-cap" style={{ "--kit-share": capBps / 100 } as CSSProperties} /> : null}
      </div>
      <div className="kit-capital-legend">
        {segments.map((s) => {
          const body = (
            <>
              <span aria-hidden className="kit-capital-dot" style={{ background: s.color }} />
              {s.label}
              <span className="kit-capital-amount">{format(s.valueBase)}</span>
              {s.extra ? <span className="kit-capital-extra">{s.extra}</span> : null}
            </>
          );
          return onFilter && !s.fixed ? (
            <button key={s.id} type="button" className="kit-capital-chip" aria-pressed={active === s.id} onClick={() => onFilter(active === s.id ? null : s.id)}>
              {body}
            </button>
          ) : (
            <span key={s.id} className="kit-capital-chip">{body}</span>
          );
        })}
      </div>
    </div>
  );
}
