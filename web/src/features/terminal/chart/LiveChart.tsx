"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/chart/LiveChart.tsx — the line follows `@cwf/markets/live-ticks`
// (the ops `ticks` topic, D-196) instead of Owarine's spot stream; Mitoshi's chart tokens (DESIGN.md chart map) and
// fonts (`styles/terminal.css`); candles from ops `/prices/candles`; the loop starts after the first paint (the splash
// that gates it in Tradash arrives with 23h).
import { liveTick, subscribeLiveTick } from "@cwf/markets/live-ticks";
import { useEffect, useRef, type RefObject } from "react";
import { ensureLiveTicks } from "@/features/prices/stream-config";
import { webEnv } from "@/lib/env";
import { haptic } from "@/lib/haptics";
import { whenSplashDone } from "@/lib/splash";
import { CandleView } from "./candle-view";
import type { CandleInterval } from "./candles";
import { ChartEngine, type ChartOverlay, type ChartTheme, type FrameInfo } from "./chart-engine";
import type { ChartPins, ChartView } from "./chart-style";
import { DotGrid } from "./dot-grid";
import "@/styles/terminal.css";
import { modalOpen } from "@/lib/modal-signal";

export type { ChartLevel, ChartOverlay, FrameInfo } from "./chart-engine";

/** What the controls ask of the chart: whether the candle view is panned away, and to come back. */
export interface ChartHandle {
  offCentre(): boolean;
  recentre(): void;
  /** Where the candles came from (ops names it), or null in line view. */
  candleSource(): string | null;
}

export interface LiveChartProps {
  /** The ticker the line follows (`BTC`, `TSLA`). */
  symbol: string;
  /** Levels and the open position's PnL; written by the parent, read every frame (no re-render per tick). */
  overlay?: RefObject<ChartOverlay | null>;
  /** Every frame's head position and motion, for the reaction overlay. */
  onFrame?: RefObject<((info: FrameInfo | null) => void) | null>;
  /** Line (Tradash's default) or candles at `interval`. */
  view?: ChartView;
  interval?: CandleInterval;
  handle?: RefObject<ChartHandle | null>;
  className?: string;
  /** The canvas's text alternative (the terminal announces price moves separately, throttled). */
  label: string;
}

function readTheme(el: Element): { chart: ChartTheme; dots: string } {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    chart: {
      up: v("--chart-up"), down: v("--chart-down"), ink: v("--chart-text"), inverse: v("--chart-ground"), helper: v("--chart-text"),
      warn: v("--color-warning"), signed: v("--accent-fill"), darkText: v("--color-cream-ink"), lightText: v("--color-cream"),
      axisFont: v("--chart-axis-font"), pillFont: v("--chart-pill-font"), pillPriceFont: v("--chart-pill-price-font"), pillPnlFont: v("--chart-pill-pnl-font"),
      tagFont: v("--chart-tag-font"), tagStrongFont: v("--chart-tag-strong-font"), markFont: v("--chart-mark-font"),
    },
    dots: v("--ms-hairline"),
  };
}

/**
 * The pins (R4-0, D-227) from the box's CSS: `--chart-pin-top` is the viewport y where what floats over the canvas ends
 * (the terminal's header foot, `--tm-head`), `--chart-pin-bottom` the height kept clear above the canvas's foot.
 */
function readPins(el: Element): ChartPins {
  const cs = getComputedStyle(el);
  const px = (name: string) => parseFloat(cs.getPropertyValue(name)) || 0;
  return { top: Math.max(0, px("--chart-pin-top") - el.getBoundingClientRect().top), bottom: px("--chart-pin-bottom") };
}

/** A frame every this many ms while a centred modal covers the chart. */
const BEHIND_MODAL_MS = 200;

/** Runs `run` after the browser has painted the frame that mounted the chart (two animation frames). */
function afterFirstPaint(run: () => void): () => void {
  let second = 0;
  const first = requestAnimationFrame(() => (second = requestAnimationFrame(run)));
  return () => {
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
  };
}

/**
 * Tradash's chart on Mitoshi's tokens: a parallax dot field and the live line, each its own canvas at ≤ 2× device
 * resolution, one continuous animation loop. Every streamed tick goes straight to the engine; nothing here re-renders.
 */
export function LiveChart({ symbol, overlay, onFrame, view = "line", interval = "1m", handle, className, label }: LiveChartProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLCanvasElement>(null);
  const lineRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const dotsCanvas = dotsRef.current;
    const lineCanvas = lineRef.current;
    if (!box || !dotsCanvas || !lineCanvas) return;
    let theme = readTheme(box);
    const engine = new ChartEngine(lineCanvas, theme.chart, symbol);
    const dots = new DotGrid(dotsCanvas, theme.dots);
    engineRef.current = engine;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;

    const resize = () => {
      engine.resize();
      engine.setPins(readPins(box));
      dots.resize();
    };
    let drawn = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // Behind a centred modal's scrim (the first-visit tour) the line only has to stay alive: ~5 frames a second; the
      // engine's dt-corrected easing and 60 Hz sample clock keep it true across the gaps.
      if (modalOpen() && now - drawn < BEHIND_MODAL_MS) return;
      drawn = now;
      engine.setOverlay(overlay?.current ?? null);
      const info = engine.frame(now);
      dots.frame(info, reduced.matches);
      onFrame?.current?.(info);
    };
    resize();
    // Tradash starts the loop once the splash has gone (SPEC-chart §1), after a first paint; the price keeps arriving.
    let cancelPaint = () => undefined as void;
    const cancelSplash = whenSplashDone(() => (cancelPaint = afterFirstPaint(() => (raf = requestAnimationFrame(loop)))));
    const cancelStart = () => (cancelSplash(), cancelPaint());
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    // The theme, and the header's foot (`--tm-head` lands in the root's style as the header grows or shrinks).
    const mo = new MutationObserver(() => {
      theme = readTheme(box);
      engine.setTheme(theme.chart);
      engine.setPins(readPins(box));
      dots.setColour(theme.dots);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    return () => {
      cancelStart();
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      engineRef.current = null;
    };
    // The engine lives for the component; a symbol change resets it below instead of rebuilding it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ensureLiveTicks();
    engineRef.current?.reset(symbol);
    const feed = () => {
      const tick = liveTick(symbol);
      if (tick) engineRef.current?.setPrice(Number(tick.priceE8) / 1e8);
    };
    const off = subscribeLiveTick(symbol, feed);
    feed();
    return off;
  }, [symbol]);

  // The candle view: built per symbol and interval, gestures on the line canvas; line view drops it.
  useEffect(() => {
    const engine = engineRef.current;
    const canvas = lineRef.current;
    if (!engine || !canvas) return;
    if (view === "line") {
      engine.setView("line", null);
      if (handle) handle.current = { offCentre: () => false, recentre: () => undefined, candleSource: () => null };
      return;
    }
    const base = webEnv.markets.opsUrl?.replace(/\/+$/, "") ?? null;
    const candles = new CandleView(symbol, interval, base, () => haptic("tick"));
    const stop = candles.start();
    const detach = candles.attach(canvas, () => engine.geometry());
    engine.setView("candles", candles);
    if (handle) handle.current = { offCentre: () => candles.offCentre, recentre: () => candles.recentre(), candleSource: () => candles.source };
    return () => {
      stop();
      detach();
    };
  }, [view, interval, symbol, handle]);

  return (
    <div ref={boxRef} role="img" aria-label={label} data-view={view} className={className ? `terminal-chart ${className}` : "terminal-chart"}>
      <canvas ref={dotsRef} aria-hidden />
      <canvas ref={lineRef} aria-hidden />
    </div>
  );
}
