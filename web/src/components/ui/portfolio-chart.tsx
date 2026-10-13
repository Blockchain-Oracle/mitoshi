"use client";
/**
 * From 21st.dev 29532 arihantcodes/portfolio-chart — revamped per D-044 as the account's realised-P&L curve: the value
 * line (monotone, no overshoot), the drawdown-from-peak pane under it (29532's best idea, here in dollars below the
 * running peak since a P&L curve crosses zero), the range selector, a readout that follows pointer or arrow keys (Home /
 * End / Escape), and the screen-reader table. Changed: data from the host (settled Windows; the generators are gone),
 * integers until this drawing boundary, tokens for colour, the rolling digits replaced by NumberFlow on the one headline
 * figure, no rise animation under reduced motion. Shares `chart-engine` with the depth chart (installed once, E.4).
 */
import NumberFlow from "@number-flow/react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ChartDataTable, ChartState, DOWN, RangeSelector, SURFACE, UP, chartVarsClassName, monotonePath, niceTicks, useElementWidth, useHoverIndexKeys, usePrefersReducedMotion, type ChartStatus } from "./chart-engine";

export interface ValuePoint {
  tMs: number;
  /** Dollars (already scaled by the host at the boundary). */
  value: number;
}

export interface PortfolioChartLabels {
  title: string;
  range: string;
  ranges: readonly { label: string; days: number }[];
  drawdown: string;
  peak: string;
  empty: string;
  error: string;
  retry: string;
  caption: string;
}

const PAD = { top: 12, right: 56, bottom: 24, left: 8 };
const HEIGHT = 220;
const DD_SHARE = 0.26;
const GAP = 12;

const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const day = (ms: number) => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * `headless` keeps the range selector and the curve only (R4-4, D-227): where the page already states the net figure.
 * `mask` (privacy mode's dots) stands in for every dollar figure — the axis, the readout, the label and the table — so
 * the shape stays and no amount reaches the DOM.
 */
export function PortfolioChart({ points, status, labels, onRetry, className, headless = false, mask }: { points: readonly ValuePoint[]; status: ChartStatus; labels: PortfolioChartLabels; onRetry?: () => void; className?: string; headless?: boolean; mask?: string }) {
  const money = mask ? () => mask : usd;
  const reduce = usePrefersReducedMotion();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [range, setRange] = React.useState(labels.ranges.at(-1)!.label);
  const [hover, setHover] = React.useState<number | null>(null);
  const days = labels.ranges.find((r) => r.label === range)!.days;
  const newest = points.at(-1)?.tMs ?? 0;
  const view = points.filter((p) => newest - p.tMs <= days * 86_400_000);
  const n = view.length;
  const drawdowns = React.useMemo(() => {
    let peak = -Infinity;
    return view.map((p) => {
      peak = Math.max(peak, p.value);
      return p.value - peak;
    });
  }, [view]);
  const maxDd = Math.min(0, ...drawdowns);
  const w = Math.max(width, 260);
  const [x0, x1] = [PAD.left, w - PAD.right];
  const bottom = HEIGHT - PAD.bottom;
  const ddH = (bottom - PAD.top) * DD_SHARE;
  const valBottom = bottom - ddH - GAP;
  const ddTop = bottom - ddH;
  const step = Math.max(1, x1 - x0) / Math.max(n, 1);
  const cx = (i: number) => x0 + step * (i + 0.5);
  let lo = Math.min(0, ...view.map((p) => p.value));
  let hi = Math.max(0, ...view.map((p) => p.value));
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad;
  hi += pad;
  const vy = (v: number) => valBottom - ((v - lo) / (hi - lo || 1)) * (valBottom - PAD.top);
  const dy = (v: number) => ddTop + (Math.abs(v) / Math.max(0.01, Math.abs(maxDd))) * ddH;
  const valuePath = monotonePath(view.map((p, i) => ({ x: cx(i), y: vy(p.value) })));
  const ddPath = n ? `${monotonePath(drawdowns.map((v, i) => ({ x: cx(i), y: dy(v) })))}L${cx(n - 1)},${ddTop}L${cx(0)},${ddTop}Z` : "";
  const idx = hover ?? n - 1;
  const active = view[idx];
  const onKeyDown = useHoverIndexKeys({ count: n, setIndex: setHover });
  const onMove = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (box) setHover(Math.max(0, Math.min(n - 1, Math.floor((((clientX - box.left) / box.width) * w - x0) / step))));
  };
  const up = (active?.value ?? 0) >= 0;
  const effective: ChartStatus = status === "ready" && n === 0 ? "empty" : status;

  return (
    <div ref={wrapRef} className={cn("flex w-full flex-col", chartVarsClassName, className)}>
      <div className={cn("mb-3 flex flex-wrap items-start justify-between gap-3", headless && "justify-end")}>
        <div className={headless ? "sr-only" : undefined}>
          <span className="type-label-micro text-ink-secondary">{labels.title}</span>
          <div className={cn("mt-1 type-data-lg", up ? "text-profit" : "text-loss")} aria-live="polite">
            {active && mask ? mask : active ? <NumberFlow locales="en-US" value={active.value} format={{ style: "currency", currency: "USD", signDisplay: "always", minimumFractionDigits: 2, maximumFractionDigits: 2 }} /> : "—"}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 type-caption numbers text-ink-secondary">
            <span>{active ? day(active.tMs) : ""}</span>
            <span>{labels.drawdown} <span className={drawdowns[idx]! < 0 ? "text-loss" : "text-ink"}>{money(drawdowns[idx] ?? 0)}</span></span>
            <span>{labels.peak} <span className="text-ink">{money(maxDd)}</span></span>
          </div>
        </div>
        <RangeSelector ranges={labels.ranges.map((r) => r.label)} value={range} onChange={(r) => { setRange(r); setHover(null); }} label={labels.range} />
      </div>
      <ChartState status={effective} height="13.75rem" empty={labels.empty} error={labels.error} retryLabel={labels.retry} onRetry={onRetry}>
        <div className="relative w-full">
          {width === 0 ? <div className="h-55" /> : (
            <svg ref={svgRef} width={w} height={HEIGHT} viewBox={`0 0 ${w} ${HEIGHT}`} className="block w-full touch-pan-y select-none overflow-visible focus-visible:outline-(--focus-ring)" role="img" tabIndex={0} data-base-ui-swipe-ignore=""
              aria-label={`${labels.title} ${money(view.at(-1)?.value ?? 0)}. ${labels.peak} ${money(maxDd)}.`}
              onKeyDown={onKeyDown} onBlur={() => setHover(null)} onPointerMove={(e) => onMove(e.clientX)} onPointerDown={(e) => onMove(e.clientX)} onPointerLeave={() => setHover(null)}>
              {niceTicks(lo, hi, 4).map((t) => (
                <g key={t}>
                  <line x1={x0} x2={x1} y1={vy(t)} y2={vy(t)} stroke="currentColor" strokeOpacity={t === 0 ? 0.35 : 0.1} strokeDasharray={t === 0 ? undefined : "2 4"} />
                  <text x={x1 + 6} y={vy(t)} dominantBaseline="middle" fontSize={10} fill="currentColor" className="numbers">{money(t)}</text>
                </g>
              ))}
              <path d={ddPath} fill={DOWN} fillOpacity={0.14} stroke={DOWN} strokeOpacity={0.6} strokeWidth={1} />
              <path d={valuePath} fill="none" stroke={up ? UP : DOWN} strokeWidth={2} style={reduce ? undefined : { animation: "spectrum-mc-fade 520ms var(--ease-out) both" }} />
              {active ? (
                <g>
                  <line x1={cx(idx)} x2={cx(idx)} y1={PAD.top} y2={bottom} stroke="currentColor" strokeOpacity={0.4} strokeDasharray="3 3" />
                  <circle cx={cx(idx)} cy={vy(active.value)} r={4} fill={SURFACE} stroke={up ? UP : DOWN} strokeWidth={2} />
                </g>
              ) : null}
            </svg>
          )}
        </div>
      </ChartState>
      <ChartDataTable caption={labels.caption} columns={["Time", labels.title, labels.drawdown]} rows={view.map((p, i) => [day(p.tMs), money(p.value), money(drawdowns[i]!)])} />
    </div>
  );
}
