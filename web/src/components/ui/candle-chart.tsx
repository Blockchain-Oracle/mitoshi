"use client";
/**
 * From 21st.dev 20107 ssychui/candle-chart — revamped per D-044 for the launch page (R6 money, S02; D-230): OHLC candles
 * over a volume histogram, a magnet crosshair that reads the exact bucket, and an OHLC readout in a `role="status"`
 * line. Changed: the mulberry32 seed series and its `seed`/`ceil`/`mid` props are gone — the host passes real candles
 * (`candlesFromTrades`, numbers for drawing only, money stays bigints upstream); the header chrome is off (the page owns
 * the price head and the interval chips); the width and volume drag handles and wheel zoom are dropped (a phone
 * scrubs); colours are the chart tokens (`--color-chart-up/down/grid/text`); framer-motion's fade is a CSS fade, off
 * under reduced motion; the price formatter is the host's. Keyboard: arrows move the readout, Home/End jump, Escape
 * returns to the latest. The geometry is `candle-chart-math.ts`.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { AXIS_W, candleAt, layoutCandles, type ChartCandle } from "./candle-chart-math";
import "./candle-chart.css";

export type { ChartCandle };

export interface CandleChartLabels {
  /** The chart's accessible name ("$R4L3902 price"). */
  title: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface CandleChartProps {
  candles: readonly ChartCandle[];
  labels: CandleChartLabels;
  priceFmt: (n: number) => string;
  volumeFmt: (n: number) => string;
  timeFmt: (t: number) => string;
  className?: string;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e!.contentRect.width), h: Math.round(e!.contentRect.height) }));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function CandleChart({ candles, labels, priceFmt, volumeFmt, timeFmt, className }: CandleChartProps) {
  const [boxRef, { w, h }] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = candles.length;
  const L = layoutCandles(candles, Math.max(w, 240), Math.max(h, 140));
  const idx = hover ?? n - 1;
  const active = candles[idx];
  const last = candles[n - 1];

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    setHover(candleAt(L, ((e.clientX - box.left) / box.width) * Math.max(w, 240), n));
  };
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") return setHover(null);
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        return setHover(e.key === "Home" ? 0 : n - 1);
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      setHover((cur) => Math.max(0, Math.min(n - 1, (cur ?? n - 1) + (e.key === "ArrowRight" ? 1 : -1))));
    },
    [n],
  );

  const up = active ? active.c >= active.o : true;
  return (
    <div className={cn("cc", className)}>
      <p className="cc-readout numbers" role="status" aria-live="polite">
        {active ? (
          <>
            <span className="cc-readout-t">{timeFmt(active.t)}</span>
            <span>{labels.open} {priceFmt(active.o)}</span>
            <span>{labels.high} {priceFmt(active.h)}</span>
            <span>{labels.low} {priceFmt(active.l)}</span>
            <span data-up={up ? "" : undefined} className="cc-readout-c">{labels.close} {priceFmt(active.c)}</span>
            <span>{labels.volume} {volumeFmt(active.v)}</span>
          </>
        ) : null}
      </p>
      <div ref={boxRef} className="cc-box">
        {w === 0 ? null : (
          <svg
            ref={svgRef}
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            className="cc-svg"
            role="img"
            tabIndex={0}
            aria-label={last ? `${labels.title} ${priceFmt(last.c)}` : labels.title}
            data-base-ui-swipe-ignore=""
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setHover(null)}
          >
            {L.ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={L.plotW} y1={L.y(t)} y2={L.y(t)} className="cc-grid" />
                <text x={w - 4} y={L.y(t) + 3} textAnchor="end" className="cc-axis numbers">{priceFmt(t)}</text>
              </g>
            ))}
            {last ? <line x1={0} x2={L.plotW} y1={L.y(last.c)} y2={L.y(last.c)} className="cc-last" strokeDasharray="2 4" /> : null}
            <g className="cc-candles">
              {candles.map((k, i) => {
                const rising = k.c >= k.o;
                const top = L.y(Math.max(k.o, k.c));
                const bottom = L.y(Math.min(k.o, k.c));
                const x = L.xMid(i);
                return (
                  <g key={k.t} data-up={rising ? "" : undefined} data-dim={hover !== null && hover !== i ? "" : undefined} className="cc-candle">
                    <line x1={x} x2={x} y1={L.y(k.h)} y2={L.y(k.l)} />
                    <rect x={x - L.bodyW / 2} y={top} width={L.bodyW} height={Math.max(1.5, bottom - top)} />
                    <rect x={x - L.bodyW / 2} y={L.volTop + L.volH - (k.v / L.maxVolume) * L.volH} width={L.bodyW} height={Math.max(1, (k.v / L.maxVolume) * L.volH)} className="cc-vol" />
                  </g>
                );
              })}
            </g>
            {hover !== null && active ? (
              <g pointerEvents="none">
                <line x1={L.xMid(hover)} x2={L.xMid(hover)} y1={0} y2={h} className="cc-cross" />
                <line x1={0} x2={L.plotW} y1={L.y(active.c)} y2={L.y(active.c)} className="cc-cross" strokeDasharray="3 3" />
                <circle cx={L.xMid(hover)} cy={L.y(active.c)} r={3.5} data-up={up ? "" : undefined} className="cc-dot" />
                <g transform={`translate(${L.plotW + 2}, ${Math.max(0, Math.min(L.plotH - 16, L.y(active.c) - 8))})`}>
                  <rect width={AXIS_W - 4} height={16} rx={3} className="cc-tag" data-up={up ? "" : undefined} />
                  <text x={4} y={11.5} className="cc-tag-text numbers">{priceFmt(active.c)}</text>
                </g>
              </g>
            ) : null}
          </svg>
        )}
      </div>
    </div>
  );
}
