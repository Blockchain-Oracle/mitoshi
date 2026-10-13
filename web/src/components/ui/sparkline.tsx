"use client";
// From 21st.dev 30538 ssychui/balance-chart — revamped per D-044 into the table-cell sparkline (S10e). Kept: the plain-SVG
// area under a line whose colour follows the trend (here: above or below a baseline the host names — a Window's opening
// print), the fill fading 0.16 → 0, the high and low floating at their true points instead of a y-axis, the smoothing
// threshold (smooth only when points sit closer than two stroke widths — otherwise the real data, segment by segment),
// the crosshair and dot in HTML over the stretched SVG so the dot stays round, and the keyboard/pointer scrub whose
// readout always shows the real value. Changed: the demo's seeded random walk and timeframe pills → the host's own
// series (bigint prices at 1e-8, downsampled for drawing only); the baseline drawn as a dashed line; `--chart-*`/shadcn
// vars → Masayume direction tokens; sized for a table cell; an `aria-label` that states first, last and the baseline.
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SparkPoint {
  tSec: number;
  /** Price in 1e-8 units. */
  priceE8: bigint;
}

export interface SparklineProps {
  points: readonly SparkPoint[];
  /** The line the trend is read against (the Window's opening print); null draws no baseline and reads first → last. */
  baselineE8: bigint | null;
  format: (e8: bigint) => string;
  formatTime: (tSec: number) => string;
  label: string;
  className?: string;
}

const W = 240;
const H = 56;
const STROKE = 1.6;
const MAX_DRAWN = 120;

function smoothPath(p: { x: number; y: number }[]) {
  let d = `M${p[0]!.x.toFixed(2)},${p[0]!.y.toFixed(2)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]!;
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p3 = p[i + 2] ?? p2;
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(2)},${(p1.y + (p2.y - p0.y) / 6).toFixed(2)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(2)},${(p2.y - (p3.y - p1.y) / 6).toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

export function Sparkline({ points, baselineE8, format, formatTime, label, className }: SparklineProps) {
  const gid = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [plotW, setPlotW] = useState(W);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setPlotW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const view = useMemo(() => {
    if (points.length < 2) return null;
    const step = Math.max(1, Math.ceil(points.length / MAX_DRAWN));
    const drawn = points.filter((_, i) => i % step === 0 || i === points.length - 1);
    const vals = drawn.map((p) => Number(p.priceE8) / 1e8);
    const base = baselineE8 !== null ? Number(baselineE8) / 1e8 : null;
    const lo = Math.min(...vals, ...(base !== null ? [base] : []));
    const hi = Math.max(...vals, ...(base !== null ? [base] : []));
    const nx = (i: number) => (i / (drawn.length - 1)) * W;
    const ny = (v: number) => H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 14);
    const xy = vals.map((v, i) => ({ x: nx(i), y: ny(v) }));
    const smooth = plotW / (drawn.length - 1) < 2 * STROKE;
    const d = smooth ? smoothPath(xy) : xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const last = drawn[drawn.length - 1]!.priceE8;
    const up = baselineE8 !== null ? last >= baselineE8 : last >= drawn[0]!.priceE8;
    const iMax = vals.indexOf(Math.max(...vals));
    const iMin = vals.indexOf(Math.min(...vals));
    return { drawn, xy, d, up, iMax, iMin, baseY: base !== null ? ny(base) : null };
  }, [points, baselineE8, plotW]);

  if (!view) return <span className={cn("type-caption text-ink-secondary", className)}>—</span>;
  const { drawn, xy, d, up, iMax, iMin, baseY } = view;
  const hue = up ? "var(--color-up)" : "var(--color-down)";
  const at = hover !== null ? { p: drawn[hover]!, xy: xy[hover]! } : null;
  const edge = (x: number) => ((x / W) * 100 <= 15 ? { left: 0 } : (x / W) * 100 >= 85 ? { right: 0 } : { left: `${(x / W) * 100}%`, transform: "translateX(-50%)" });
  const scrub = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    setHover(Math.max(0, Math.min(drawn.length - 1, Math.round(((clientX - r.left) / r.width) * (drawn.length - 1)))));
  };
  const summary = `${label}: ${format(drawn[0]!.priceE8)} to ${format(drawn[drawn.length - 1]!.priceE8)}${baselineE8 !== null ? `, ${up ? "above" : "below"} ${format(baselineE8)}` : ""}. Arrow keys read each point.`;

  return (
    <div
      ref={ref}
      className={cn("sparkline relative h-14 w-full min-w-30 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-accent", className)}
      tabIndex={0}
      role="group"
      aria-label={summary}
      style={{ touchAction: "pan-y" }}
      data-base-ui-swipe-ignore=""
      onFocus={() => setHover((h) => h ?? drawn.length - 1)}
      onBlur={() => setHover(null)}
      onKeyDown={(e) => {
        const cur = hover ?? drawn.length - 1;
        const next = e.key === "ArrowLeft" ? cur - (e.shiftKey ? 10 : 1) : e.key === "ArrowRight" ? cur + (e.shiftKey ? 10 : 1) : e.key === "Home" ? 0 : e.key === "End" ? drawn.length - 1 : null;
        if (e.key === "Escape") setHover(null);
        if (next === null) return;
        e.preventDefault();
        setHover(Math.max(0, Math.min(drawn.length - 1, next)));
      }}
      onPointerDown={(e) => scrub(e.clientX)}
      onPointerMove={(e) => scrub(e.clientX)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={`${gid}-f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hue} stopOpacity="0.16" />
            <stop offset="100%" stopColor={hue} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#${gid}-f)`} />
        {baseY !== null ? <line x1={0} x2={W} y1={baseY} y2={baseY} stroke="var(--color-ink-secondary)" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
        <path d={d} fill="none" stroke={hue} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="pointer-events-none absolute numbers type-label-micro normal-case tracking-normal text-ink-secondary" style={{ ...edge(xy[iMax]!.x), top: 0 }} aria-hidden>{format(drawn[iMax]!.priceE8)}</span>
      <span className="pointer-events-none absolute numbers type-label-micro normal-case tracking-normal text-ink-secondary" style={{ ...edge(xy[iMin]!.x), bottom: -2 }} aria-hidden>{format(drawn[iMin]!.priceE8)}</span>
      {at ? (
        <>
          <i aria-hidden className="pointer-events-none absolute inset-y-0 w-0 border-l border-dashed border-ink-secondary" style={{ left: `${(at.xy.x / W) * 100}%` }} />
          <i aria-hidden className="pointer-events-none absolute block size-1.75 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-1" style={{ left: `${(at.xy.x / W) * 100}%`, top: `${(at.xy.y / H) * 100}%`, background: hue }} />
          <div role="status" className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-hairline bg-surface-1 px-2 py-1 shadow-lg" style={{ left: `${(at.xy.x / W) * 100}%`, bottom: "100%", transform: at.xy.x / W < 0.5 ? "translateX(0)" : "translateX(-100%)" }}>
            <div className="numbers type-caption text-ink">{format(at.p.priceE8)}</div>
            <div className="numbers type-label-micro normal-case tracking-normal text-ink-secondary">{formatTime(at.p.tSec)}</div>
          </div>
        </>
      ) : null}
    </div>
  );
}
