"use client";
/**
 * From 21st.dev 29968 arihantcodes/depth-chart and 29532 arihantcodes/portfolio-chart — their shared registry helper
 * `chart-engine` (installed once, E.4), revamped per D-044: the mock generators and fixtures are deleted (real-data
 * rule), `--spectrum-chart-*` map to Masayume's profit/loss/surface tokens (`styles/chart-engine.css`, no literals
 * here), keyframes live in that sheet, the loading / empty / error states speak the app's words and the screen-reader
 * table and keyboard index are kept. Floats exist only here, at the drawing boundary.
 */
import * as React from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export const chartVarsClassName = "chart-engine";
export const UP = "var(--spectrum-chart-up)";
export const DOWN = "var(--spectrum-chart-down)";
export const SURFACE = "var(--spectrum-chart-surface)";
export const EASE = "var(--ease-out)";

export function formatMoney(value: number, compact = false): string {
  const digits = compact ? 2 : value >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: compact ? "compact" : "standard", minimumFractionDigits: compact ? 0 : digits, maximumFractionDigits: digits }).format(value);
}

export function formatSignedPct(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}%`;
}

export function formatAxisPrice(value: number): string {
  return formatMoney(value, Math.abs(value) >= 10_000);
}

export function niceTicks(lo: number, hi: number, target = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [lo];
  const raw = (hi - lo) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 2.25 ? 2.5 : norm >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 0.001; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** A monotone cubic through the points (no overshoot past a real value). */
export function monotonePath(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0]!.x},${points[0]!.y}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = points[i + 1]!.x - points[i]!.x;
    slope[i] = dx[i] === 0 ? 0 : (points[i + 1]!.y - points[i]!.y) / dx[i]!;
  }
  const t = new Array<number>(n);
  t[0] = slope[0]!;
  t[n - 1] = slope[n - 2]!;
  for (let i = 1; i < n - 1; i += 1) {
    if (slope[i - 1]! * slope[i]! <= 0) t[i] = 0;
    else {
      const w1 = 2 * dx[i]! + dx[i - 1]!;
      const w2 = dx[i]! + 2 * dx[i - 1]!;
      t[i] = (w1 + w2) / (w1 / slope[i - 1]! + w2 / slope[i]!);
    }
  }
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 0; i < n - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    d += `C${(a.x + dx[i]! / 3).toFixed(2)},${(a.y + (t[i]! * dx[i]!) / 3).toFixed(2)} ${(b.x - dx[i]! / 3).toFixed(2)},${(b.y - (t[i + 1]! * dx[i]!) / 3).toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
  }
  return d;
}

/** Reduced motion through motion's own hook (MotionConfig `reducedMotion="user"`), so one setting governs everything. */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() === true;
}

export function useElementWidth<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export type BookLevel = { price: number; size: number; total: number };
export type OrderBook = { mid: number; spread: number; bids: BookLevel[]; asks: BookLevel[] };
export type ChartStatus = "ready" | "loading" | "empty" | "error";

/** Arrow keys move the readout through the points, Home/End jump, Escape returns to live (29532's keyboard index). */
export function useHoverIndexKeys({ count, setIndex, clear }: { count: number; setIndex: React.Dispatch<React.SetStateAction<number | null>>; clear?: () => void }) {
  return React.useCallback(
    (event: React.KeyboardEvent) => {
      const { key } = event;
      if (key === "Escape") {
        event.preventDefault();
        return clear ? clear() : setIndex(null);
      }
      if (key === "Home" || key === "End") {
        event.preventDefault();
        return setIndex(key === "Home" ? 0 : count - 1);
      }
      if (key !== "ArrowLeft" && key !== "ArrowRight") return;
      event.preventDefault();
      const step = key === "ArrowRight" ? 1 : -1;
      setIndex((current) => Math.max(0, Math.min(count - 1, (current ?? count - 1) + step)));
    },
    [count, setIndex, clear],
  );
}

/** The chart's loading, empty and error faces at the chart's own height (no layout shift), in the app's words. */
export function ChartState({ status, height, empty, error, onRetry, retryLabel, children }: { status: ChartStatus; height: string; empty: string; error: string; onRetry?: () => void; retryLabel: string; children: React.ReactNode }) {
  if (status === "ready") return <>{children}</>;
  return (
    <div className="chart-state" style={{ height }} role="status" aria-busy={status === "loading"}>
      {status === "loading" ? (
        <div className="chart-skeleton" aria-hidden>
          {[0, 1, 2, 3].map((i) => <span key={i} className="chart-skeleton-rule" />)}
        </div>
      ) : (
        <div className="flex max-w-(--content-reading) flex-col items-center gap-2 px-6 text-center">
          <p className="type-body text-ink-secondary">{status === "empty" ? empty : error}</p>
          {status === "error" && onRetry ? (
            <button type="button" onClick={onRetry} className="min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink">{retryLabel}</button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** The chart's numbers for screen readers, clipped by its wrapper (an sr-only table would still widen a phone page). */
export function ChartDataTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The range selector (29532), a radiogroup-grammar tablist with a sliding thumb in CSS; tokens only. */
export function RangeSelector({ ranges, value, onChange, label }: { ranges: readonly string[]; value: string; onChange: (label: string) => void; label: string }) {
  const index = Math.max(0, ranges.indexOf(value));
  return (
    <div role="tablist" aria-label={label} className="chart-range" style={{ "--range-count": ranges.length, "--range-index": index } as React.CSSProperties}>
      <span aria-hidden className="chart-range-thumb" />
      {ranges.map((r) => (
        <button key={r} type="button" role="tab" aria-selected={r === value} onClick={() => onChange(r)} className={cn("chart-range-tab min-h-touch", r === value && "is-active")}>
          {r}
        </button>
      ))}
    </div>
  );
}
