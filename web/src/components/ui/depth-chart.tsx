"use client";
/**
 * From 21st.dev 29968 arihantcodes/depth-chart — revamped per D-044: cumulative bid and ask depth around the mid, fed a
 * real book by the host (the SOL/BTC fixtures are deleted), direction colours from the tokens (no gradients: a flat
 * wash under a hairline), the rise animation off under reduced motion, and — added from 29532's keyboard index — arrow
 * keys walk the price levels with the same readout the pointer shows (`role="status"`). The screen-reader table stays.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { ChartDataTable, ChartState, DOWN, SURFACE, UP, chartVarsClassName, niceTicks, useElementWidth, usePrefersReducedMotion, type BookLevel, type ChartStatus, type OrderBook } from "./chart-engine";

const PAD = { top: 18, right: 52, bottom: 24, left: 8 };
const HEIGHT = 200;

export interface DepthChartLabels {
  title: string;
  mid: string;
  spread: string;
  bidDepth: string;
  askDepth: string;
  empty: string;
  error: string;
  retry: string;
  caption: string;
  bid: string;
  ask: string;
}

export interface DepthChartProps {
  book: OrderBook | null;
  status: ChartStatus;
  labels: DepthChartLabels;
  formatPrice: (price: number) => string;
  formatSize: (size: number) => string;
  onRetry?: () => void;
  className?: string;
}

function stepPath(levels: BookLevel[], xOf: (p: number) => number, yOf: (t: number) => number, midX: number, baseY: number): string {
  if (!levels.length) return "";
  let d = `M${midX.toFixed(2)},${baseY.toFixed(2)}`;
  let prevY = baseY;
  for (const l of levels) {
    const x = xOf(l.price);
    const y = yOf(l.total);
    d += `L${x.toFixed(2)},${prevY.toFixed(2)}L${x.toFixed(2)},${y.toFixed(2)}`;
    prevY = y;
  }
  return `${d}L${xOf(levels.at(-1)!.price).toFixed(2)},${baseY.toFixed(2)}Z`;
}

export function DepthChart({ book, status, labels, formatPrice, formatSize, onRetry, className }: DepthChartProps) {
  const reduce = usePrefersReducedMotion();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [hoverX, setHoverX] = React.useState<number | null>(null);
  const b = book ?? { mid: 0.5, spread: 0, bids: [], asks: [] };
  const w = Math.max(width, 260);
  const [x0, x1, y0, y1] = [PAD.left, w - PAD.right, PAD.top, HEIGHT - PAD.bottom];
  const lo = b.bids.at(-1)?.price ?? b.mid;
  const hi = b.asks.at(-1)?.price ?? b.mid;
  const half = Math.max(b.mid - lo, hi - b.mid) || 0.05;
  const [dLo, dHi] = [b.mid - half, b.mid + half];
  const maxTotal = Math.max(b.bids.at(-1)?.total ?? 0, b.asks.at(-1)?.total ?? 0, 1);
  const xOf = (p: number) => x0 + ((p - dLo) / (dHi - dLo)) * (x1 - x0);
  const yOf = (t: number) => y1 - (t / maxTotal) * (y1 - y0);
  const priceAt = (x: number) => dLo + ((x - x0) / (x1 - x0)) * (dHi - dLo);
  const midX = xOf(b.mid);
  const levels = [...b.bids.slice().reverse(), ...b.asks];
  const probe = (() => {
    if (hoverX === null) return null;
    const price = priceAt(hoverX);
    const isBid = price < b.mid;
    let level: BookLevel | null = null;
    for (const c of isBid ? b.bids : b.asks) if (isBid ? price <= c.price : price >= c.price) level = c;
    return { price, isBid, total: level?.total ?? 0 };
  })();
  const onMove = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (box) setHoverX(Math.max(x0, Math.min(x1, ((clientX - box.left) / box.width) * w)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setHoverX(null);
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const xs = levels.map((l) => xOf(l.price));
    if (xs.length === 0) return;
    const at = hoverX === null ? xs.findIndex((x) => x >= midX) : xs.findIndex((x) => Math.abs(x - hoverX) < 0.5);
    const next = Math.max(0, Math.min(xs.length - 1, (at < 0 ? 0 : at) + (e.key === "ArrowRight" ? 1 : -1)));
    setHoverX(xs[next]!);
  };
  const hTicks = niceTicks(0, maxTotal, 3);

  return (
    <div ref={wrapRef} className={cn("flex w-full flex-col", chartVarsClassName, className)}>
      <dl className="mb-2 flex flex-wrap items-end justify-between gap-3 type-caption numbers">
        <div><dt className="text-ink-muted">{labels.mid}</dt><dd className="text-ink">{formatPrice(b.mid)}</dd></div>
        <div><dt className="text-ink-muted">{labels.spread}</dt><dd className="text-ink">{formatPrice(b.spread)}</dd></div>
        <div><dt className="text-ink-muted">{labels.bidDepth}</dt><dd className="text-profit">{formatSize(b.bids.at(-1)?.total ?? 0)}</dd></div>
        <div><dt className="text-ink-muted">{labels.askDepth}</dt><dd className="text-loss">{formatSize(b.asks.at(-1)?.total ?? 0)}</dd></div>
      </dl>
      <ChartState status={status} height="12.5rem" empty={labels.empty} error={labels.error} retryLabel={labels.retry} onRetry={onRetry}>
        <div className="relative w-full">
          {width === 0 ? <div className="h-50" /> : (
            <svg ref={svgRef} width={w} height={HEIGHT} viewBox={`0 0 ${w} ${HEIGHT}`} className="block w-full touch-pan-y select-none overflow-visible focus-visible:outline-(--focus-ring)" role="img" tabIndex={0}
              aria-label={`${labels.title}. ${labels.mid} ${formatPrice(b.mid)}, ${labels.spread} ${formatPrice(b.spread)}.`}
              onPointerMove={(e) => onMove(e.clientX)} onPointerDown={(e) => onMove(e.clientX)} onPointerLeave={() => setHoverX(null)} onKeyDown={onKey} onBlur={() => setHoverX(null)}>
              {hTicks.map((t) => <line key={t} x1={x0} x2={x1} y1={yOf(t)} y2={yOf(t)} stroke="currentColor" strokeOpacity={0.12} strokeDasharray="2 4" />)}
              <g style={{ transformBox: "fill-box", transformOrigin: "bottom center", animation: reduce ? undefined : "spectrum-mc-rise 620ms var(--ease-out) both" }}>
                <path d={stepPath(b.bids, xOf, yOf, midX, y1)} fill={UP} fillOpacity={0.14} stroke={UP} strokeWidth={1.5} />
                <path d={stepPath(b.asks, xOf, yOf, midX, y1)} fill={DOWN} fillOpacity={0.14} stroke={DOWN} strokeWidth={1.5} />
              </g>
              <line x1={midX} x2={midX} y1={y0 - 4} y2={y1} stroke="currentColor" strokeOpacity={0.5} strokeDasharray="3 3" />
              {hTicks.filter((t) => t > 0).map((t) => <text key={t} x={x1 + 6} y={yOf(t)} dominantBaseline="middle" fontSize={10} fill="currentColor" className="numbers">{formatSize(t)}</text>)}
              {niceTicks(dLo, dHi, 4).filter((t) => Math.abs(xOf(t) - midX) > 24).map((t) => (
                <text key={t} x={Math.max(x0 + 16, Math.min(x1 - 16, xOf(t)))} y={y1 + 15} textAnchor="middle" fontSize={10} fill="currentColor" className="numbers">{formatPrice(t)}</text>
              ))}
              {hoverX !== null && probe ? (
                <g>
                  <line x1={hoverX} x2={hoverX} y1={y0} y2={y1} stroke="currentColor" strokeOpacity={0.45} strokeDasharray="3 3" />
                  <circle cx={hoverX} cy={yOf(probe.total)} r={4} fill={SURFACE} stroke={probe.isBid ? UP : DOWN} strokeWidth={2} />
                </g>
              ) : null}
            </svg>
          )}
          {probe ? (
            <p role="status" className="pointer-events-none absolute top-0 left-2 rounded-md border border-hairline bg-surface-2 px-2 py-1 type-caption numbers text-ink">
              {probe.isBid ? labels.bid : labels.ask} {formatPrice(probe.price)} · {formatSize(probe.total)}
            </p>
          ) : null}
        </div>
      </ChartState>
      <ChartDataTable caption={labels.caption} columns={["Price", "Side", "Size", "Cumulative"]} rows={[...b.asks.map((l) => [formatPrice(l.price), labels.ask, formatSize(l.size), formatSize(l.total)]), ...b.bids.map((l) => [formatPrice(l.price), labels.bid, formatSize(l.size), formatSize(l.total)])]} />
    </div>
  );
}
