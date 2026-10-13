"use client";
// From 21st.dev 23549 ddoemonn/progress-bar — revamped onto Mitoshi's tokens (R4-11, D-227) for a memecoin's curve to
// graduation: kept the labelled `role="progressbar"` with `aria-valuetext`, the spring fill on `scaleX`, the pending /
// complete crossfade and the reduced-motion instant path; dropped the stone/blue palette and px utilities (the track and
// fill live in `styles/launch.css` on tokens) and the indeterminate shimmer (a curve's progress is always read).
import { m, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

const FILL = { type: "spring", stiffness: 210, damping: 34, mass: 0.9 } as const;
const INSTANT = { duration: 0 } as const;

export interface ProgressBarProps {
  /** 0 … max; null while it is read. */
  value: number | null;
  max?: number;
  label: string;
  /** The right-hand reading; defaults to the percentage. */
  valueText?: string;
  compact?: boolean;
  className?: string;
}

export function ProgressBar({ value, max = 100, label, valueText, compact = false, className }: ProgressBarProps) {
  const reduced = useReducedMotion();
  const id = useId();
  const fraction = value === null || max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const percent = Math.floor(fraction * 100);
  const text = valueText ?? `${percent}%`;
  return (
    <div className={cn("pbar", compact && "pbar--compact", className)} data-complete={fraction >= 1 ? "" : undefined}>
      {compact ? null : (
        <div className="pbar-head">
          <span id={id} className="pbar-label">{label}</span>
          <span aria-hidden className="pbar-value numbers">{value === null ? "…" : text}</span>
        </div>
      )}
      <div role="progressbar" aria-labelledby={compact ? undefined : id} aria-label={compact ? label : undefined} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value === null ? undefined : Math.round(fraction * max * 100) / 100} aria-valuetext={value === null ? undefined : text} className="pbar-track">
        <m.span aria-hidden className="pbar-fill" initial={false} animate={{ scaleX: fraction }} transition={reduced ? INSTANT : FILL} />
      </div>
    </div>
  );
}
