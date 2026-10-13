"use client";
/**
 * The reserve's share-price line (R6 money, S09; D-230) — From 21st.dev 29532 arihantcodes/portfolio-chart, revamped on
 * its own engine (`components/ui/chart-engine`: the monotone path, the arrow-key readout, the screen-reader table) for
 * one series on the black reserve card: the share price over the chosen range with a dashed par line at 1.0000, the
 * line in the range's tone (up, down, flat ink), and a scrub readout ("Oct 3 · 0.9988") in place of the headline the
 * card already states. Senryo's EarnChart (P5) is the model: a share-value line, never a projection. Numbers are drawn
 * as floats only here (the money stays bigints upstream); 160 px tall on a phone, 200 from 640.
 */
import * as React from "react";
import { ChartDataTable, chartVarsClassName, monotonePath, useElementWidth, useHoverIndexKeys, usePrefersReducedMotion } from "@/components/ui/chart-engine";
import { cn } from "@/lib/utils";
import type { ReturnTone } from "./returns";

export interface SharePoint {
  tMs: number;
  /** The share price as a number (1 = par), for drawing only. */
  price: number;
}

const PAD = { top: 10, right: 44, bottom: 6, left: 2 };
const PHONE_HEIGHT = 160;
const WIDE_HEIGHT = 200;
const WIDE_FROM = 640;

// Floored to 4 dp, as the card states the share price (`formatSharePrice`), so the readout and the card agree.
const priceText = (p: number) => (Math.floor(p * 10_000 + 1e-7) / 10_000).toFixed(4);
const dayText = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function ShareChart({ points, tone, label, caption, aside, className }: { points: readonly SharePoint[]; tone: ReturnTone; label: string; caption: string; aside?: React.ReactNode; className?: string }) {
  const reduce = usePrefersReducedMotion();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = React.useState<number | null>(null);
  const n = points.length;
  const w = Math.max(width, 240);
  const h = width >= WIDE_FROM ? WIDE_HEIGHT : PHONE_HEIGHT;
  const prices = points.map((p) => p.price);
  let lo = Math.min(1, ...prices);
  let hi = Math.max(1, ...prices);
  const pad = (hi - lo) * 0.15 || 0.001;
  lo -= pad;
  hi += pad;
  const [x0, x1] = [PAD.left, w - PAD.right];
  const t0 = points[0]?.tMs ?? 0;
  const span = Math.max(1, (points.at(-1)?.tMs ?? 1) - t0);
  const cx = (i: number) => x0 + ((points[i]!.tMs - t0) / span) * (x1 - x0);
  const vy = (v: number) => h - PAD.bottom - ((v - lo) / (hi - lo)) * (h - PAD.top - PAD.bottom);
  const path = monotonePath(points.map((p, i) => ({ x: cx(i), y: vy(p.price) })));
  const area = n > 1 ? `${path}L${cx(n - 1)},${h - PAD.bottom}L${cx(0)},${h - PAD.bottom}Z` : "";
  const idx = hover ?? n - 1;
  const active = points[idx];
  const onKeyDown = useHoverIndexKeys({ count: n, setIndex: setHover });
  const onMove = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || n === 0) return;
    const x = ((clientX - box.left) / box.width) * w;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(cx(i) - x) < Math.abs(cx(best) - x)) best = i;
    setHover(best);
  };
  return (
    <div ref={wrapRef} className={cn("ea-chart", chartVarsClassName, className)} data-tone={tone}>
      <div className="ea-chart-head">
        <p className="ea-chart-readout numbers" aria-hidden>
          {active ? `${dayText(active.tMs)} · ${priceText(active.price)}` : ""}
        </p>
        {aside}
      </div>
      {width === 0 ? <div className="ea-chart-box" /> : (
        <svg
          ref={svgRef}
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          className="ea-chart-svg"
          role="img"
          tabIndex={0}
          data-base-ui-swipe-ignore=""
          aria-label={active ? `${label} ${priceText(points.at(-1)!.price)}` : label}
          onKeyDown={onKeyDown}
          onBlur={() => setHover(null)}
          onPointerMove={(e) => onMove(e.clientX)}
          onPointerDown={(e) => onMove(e.clientX)}
          onPointerLeave={() => setHover(null)}
        >
          <line x1={x0} x2={x1} y1={vy(1)} y2={vy(1)} className="ea-chart-par" strokeDasharray="3 4" />
          <text x={x1 + 6} y={vy(1)} dominantBaseline="middle" className="ea-chart-axis numbers">1.0000</text>
          {lo < 1 - pad * 0.5 ? <text x={x1 + 6} y={vy(lo + pad)} dominantBaseline="middle" className="ea-chart-axis numbers">{priceText(lo + pad)}</text> : null}
          {hi > 1 + pad * 0.5 ? <text x={x1 + 6} y={vy(hi - pad)} dominantBaseline="middle" className="ea-chart-axis numbers">{priceText(hi - pad)}</text> : null}
          <path d={area} className="ea-chart-area" />
          <path d={path} className="ea-chart-line" style={reduce ? undefined : { animation: "spectrum-mc-fade 300ms var(--ease-out) both" }} />
          {active && hover !== null ? <line x1={cx(idx)} x2={cx(idx)} y1={PAD.top} y2={h - PAD.bottom} className="ea-chart-cursor" strokeDasharray="3 3" /> : null}
          {active ? <circle cx={cx(idx)} cy={vy(active.price)} r={4} className="ea-chart-dot" /> : null}
        </svg>
      )}
      <ChartDataTable caption={caption} columns={["Time", label]} rows={points.map((p) => [dayText(p.tMs), priceText(p.price)])} />
    </div>
  );
}
