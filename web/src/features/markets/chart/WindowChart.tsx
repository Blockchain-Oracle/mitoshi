"use client";
import "./window-chart.css";
// Ported from Owarine 90a91d71:web/src/features/markets/chart/WindowChart.tsx (O-3, D-222) — on Mitoshi's one tick
// stream (`@cwf/markets/live-ticks`: the ring is Owarine's series snapshot, the latest tick its live spot), the chain-
// corrected clock, the 1e-8 print scale and Mitoshi's tokens (`window-chart.css`). Mitoshi lists no baskets.
import { liveRing, liveTick, subscribeLiveTick } from "@cwf/markets/live-ticks";
import { useEffect, useRef } from "react";
import { ensureLiveTicks } from "@/features/prices/stream-config";
import { CanvasOdometer } from "@/features/terminal/chart/canvas-odometer";
import { easeFor, PRICE_EASE } from "@/features/terminal/chart/engine";
import { nowMs as clockNowMs } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { HERO } from "../copy";
import type { ChartPoint } from "../data/useChartSeries";
import { PRICE_SCALE } from "../units";
import { drawFrame, type ChartPalette, type Frame } from "./draw";
import { assemble, chartSpan, clamp, truncate, decimate, displayDecimals, lowerBound, priceTicks, stepDecimals, timeTicks, yRange, type Series, type WindowTimes } from "./model";

export interface WindowChartProps {
  /** The asset the prices are in (dollars). */
  asset: string;
  /** The spot symbol whose live series the line follows; null draws `backfill` alone, with no live head. */
  symbol: string | null;
  /** The Window's open and close; null charts the asset alone (rolling when live, its own span when static). */
  times: WindowTimes | null;
  /** The level the line is read against — the opening print, or the previous close — on the print scale. */
  referenceRaw: bigint | null;
  referenceLabel?: string;
  /** Older points (prints, the signed archive) drawn wherever the live series has not started. */
  backfill?: readonly ChartPoint[];
  /**
   * With no `symbol`, the backfill IS the live series (it grows with every signed tick): the head eases to its newest
   * point and pulses while the Window runs. One feed only — a second source a few cents apart zigzags the line.
   */
  live?: boolean;
  /** Compact drops the axis words, the dot field and the time axis (the ticket drawer's 128 px chart). */
  variant?: "full" | "compact";
  className?: string;
  label?: string;
}

const E_SCALE = 10 ** PRICE_SCALE;
const EMPTY: Series = { t: [], p: [] };
const PULSE_MS = 1_600;
/** The y range follows the data at this per-sample approach, so a new high stretches the axis instead of jolting it. */
const RANGE_EASE = 0.08;
const GUTTER_MIN = 64;

function readPalette(el: Element): ChartPalette {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    ink: v("--wc-ink"), muted: v("--wc-muted"), helper: v("--wc-helper"), hairline: v("--wc-hairline"), card: v("--wc-card"),
    up: v("--wc-up-line"), down: v("--wc-down-line"), upText: v("--wc-up"), downText: v("--wc-down"), onLine: v("--wc-on-line"), inverse: v("--wc-inverse"),
    axisFont: v("--wc-axis-font"), pillFont: v("--wc-pill-font"), tagFont: v("--wc-tag-font"), tagStrongFont: v("--wc-tag-strong-font"),
  };
}

const numberFormats = new Map<number, Intl.NumberFormat>();
function num(v: number, dp: number): string {
  let f = numberFormats.get(dp);
  if (!f) numberFormats.set(dp, (f = new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })));
  return f.format(truncate(v, dp));
}

const clockShort = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const clockLong = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const dayShort = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });

/**
 * The market page's chart: the Window as a live picture. A time axis from a lead before the open to the close, the
 * opening print as the line to beat, the price green above it and red below, a pulsing head that eases to every
 * streamed tick and a pill whose digits roll. It reads the tab's live series (a sample a second, seeded from the last
 * half hour) inside its own animation frame, so a tick never re-renders React.
 */
export function WindowChart(props: WindowChartProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const { symbol } = props;

  // Joins the symbol's live series for as long as the chart is mounted; the frame reads its snapshot.
  useEffect(() => {
    if (!symbol) return undefined;
    ensureLiveTicks();
    return subscribeLiveTick(symbol, () => undefined);
  }, [symbol]);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!box || !canvas || !ctx) return;
    let pal = readPalette(box);
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let last = 0;
    let eased: number | null = null;
    let range: { lo: number; hi: number } | null = null;
    let identity = "";
    let pointerX: number | null = null;
    let backfillOf: readonly ChartPoint[] | undefined;
    let backfill: Series = EMPTY;
    const odometer = new CanvasOdometer();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const resize = () => {
      const rect = box.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    };

    const frame = (now: number) => {
      raf = visible ? requestAnimationFrame(frame) : 0;
      const dt = last ? now - last : 16;
      last = now;
      if (w < 40 || h < 40) return;
      const p = propsRef.current;
      const compact = p.variant === "compact";
      const id = `${p.symbol}|${p.times?.openMs}|${p.times?.closeMs}|${p.asset}`;
      if (id !== identity) {
        identity = id;
        eased = null;
        range = null;
        odometer.reset();
      }
      const nowMs = clockNowMs();
      if (p.backfill !== backfillOf) {
        backfillOf = p.backfill;
        backfill = p.backfill ? { t: p.backfill.map((pt) => pt.timeSec * 1000), p: p.backfill.map((pt) => Number(pt.valueRaw) / E_SCALE) } : EMPTY;
      }
      const live: Series = p.symbol ? liveRing(p.symbol) : EMPTY;
      const isLive = p.symbol !== null ? live.t.length > 0 || liveTick(p.symbol) !== null : p.live === true && backfill.t.length > 0;
      const span = chartSpan(p.times, nowMs, backfill, isLive);
      const closed = p.times !== null && nowMs >= p.times.closeMs;
      const untilMs = p.times ? Math.min(nowMs, p.times.closeMs) : nowMs;
      const pts = assemble(backfill, live, span.fromMs, isLive ? untilMs : Number.POSITIVE_INFINITY);
      const reference = p.referenceRaw === null ? null : Number(p.referenceRaw) / E_SCALE;

      // The head: eased toward the latest tick while live; the last point otherwise.
      const tick = p.symbol && !closed ? liveTick(p.symbol) : null;
      const target = tick ? Number(tick.priceE8) / 1e8 : pts.p.length ? pts.p[pts.p.length - 1]! : null;
      if (target !== null) eased = eased === null || reduced.matches ? target : eased + (target - eased) * easeFor(PRICE_EASE, dt);
      const headT = isLive ? untilMs : pts.t.length ? pts.t[pts.t.length - 1]! : null;
      if (isLive && eased !== null && headT !== null) {
        pts.t.push(headT);
        pts.p.push(eased);
      }

      // Layout: the gutter fits the widest number it must show.
      const money = (v: number, dp: number) => `$${num(v, dp)}`;
      const headText = eased === null ? null : money(eased, displayDecimals(eased));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = pal.pillFont;
      const gutter = compact ? Math.max(GUTTER_MIN, (headText ? ctx.measureText(headText).width : 0) + 26) : Math.max(GUTTER_MIN + 24, (headText ? ctx.measureText(headText).width : 0) + 28);
      const plot = { left: 0, right: w - gutter, top: compact ? 10 : 26, bottom: h - (compact ? 10 : 28) };
      const plotW = plot.right - plot.left;
      const msPerPx = (span.toMs - span.fromMs) / Math.max(1, plotW);
      const d = decimate(pts.t, pts.p, span.fromMs, msPerPx);

      const want = yRange(d.p, reference);
      if (want) range = range === null || reduced.matches ? want : { lo: range.lo + (want.lo - range.lo) * easeFor(RANGE_EASE, dt), hi: range.hi + (want.hi - range.hi) * easeFor(RANGE_EASE, dt) };
      const r = range;
      const xOf = (t: number) => plot.left + ((t - span.fromMs) / (span.toMs - span.fromMs)) * plotW;
      const yOf = (v: number) => (r ? plot.bottom - ((v - r.lo) / (r.hi - r.lo)) * (plot.bottom - plot.top) : (plot.top + plot.bottom) / 2);

      const n = d.t.length;
      const xs = new Float64Array(n);
      const ys = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        xs[i] = xOf(d.t[i]!);
        ys[i] = yOf(d.p[i]!);
      }

      const grid = r ? priceTicks(r.lo, r.hi, compact ? 3 : 4) : null;
      const gridDp = grid ? Math.max(stepDecimals(grid.step), 0) : 0;
      const tt = timeTicks(span, plotW, 84);
      const timeText = (at: number) => (tt.stepMs >= 86_400_000 ? dayShort.format(at) : tt.stepMs < 60_000 ? clockLong.format(at) : clockShort.format(at));

      let hover: Frame["hover"] = null;
      if (pointerX !== null && n > 0) {
        const at = span.fromMs + ((pointerX - plot.left) / plotW) * (span.toMs - span.fromMs);
        const i = clamp(lowerBound(d.t, at), 0, n - 1);
        const k = i > 0 && Math.abs(d.t[i - 1]! - at) < Math.abs(d.t[i]! - at) ? i - 1 : i;
        const v = d.p[k]!;
        const lines: NonNullable<Frame["hover"]>["lines"] = [
          { text: clockLong.format(d.t[k]!), tone: "muted" },
          { text: money(v, displayDecimals(v)), tone: "ink" },
        ];
        if (reference !== null && reference !== 0) {
          const move = v - reference;
          const sign = move >= 0 ? "+" : "−";
          lines.push({ text: `${sign}${money(Math.abs(move), displayDecimals(reference))} · ${sign}${num(Math.abs(move / reference) * 100, 3)}% ${HERO.chart.vs(p.referenceLabel ?? HERO.openingPrint)}`, tone: move >= 0 ? "up" : "down" });
        }
        hover = { x: xs[k]!, y: ys[k]!, lines };
      }

      const opening = p.times && nowMs < p.times.openMs;
      drawFrame(
        ctx,
        pal,
        {
          w, h, plot, xs, ys, n, compact,
          head: eased !== null && headT !== null && headText ? { x: xOf(headT), y: yOf(eased), text: headText, value: eased, live: isLive && !closed } : null,
          reference: reference === null ? null : { y: yOf(reference), text: money(reference, displayDecimals(reference)), label: p.referenceLabel ?? HERO.openingPrint },
          grid: grid ? grid.ticks.map((v) => ({ y: yOf(v), text: money(v, gridDp) })) : [],
          times: tt.ticks.map((at) => ({ x: xOf(at), text: timeText(at) })),
          window: p.times ? { openX: xOf(p.times.openMs), closeX: xOf(p.times.closeMs), openLabel: opening ? HERO.chart.opens : HERO.chart.open, closeLabel: closed ? HERO.chart.closed : HERO.chart.closes } : null,
          nowX: p.times && !closed ? xOf(nowMs) : null,
          hover,
          pulse: isLive && !closed && !reduced.matches ? (now % PULSE_MS) / PULSE_MS : null,
        },
        odometer,
      );
      odometer.step(dt);
    };

    const start = () => {
      if (!raf && visible) raf = requestAnimationFrame(frame);
    };
    resize();
    start();
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    // Off screen (a reel scrolled away, a collapsed drawer) the loop stops; it resumes on return.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) {
        last = 0;
        start();
      }
    });
    io.observe(box);
    const mo = new MutationObserver(() => (pal = readPalette(box)));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const move = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerX = e.clientX - rect.left;
    };
    const leave = () => (pointerX = null);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointercancel", leave);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", move);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointercancel", leave);
    };
  }, []);

  return (
    <div ref={boxRef} role="img" aria-label={props.label ?? `${props.asset} price chart`} className={cn("window-chart relative h-full w-full", props.className)}>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full touch-pan-y" aria-hidden />
    </div>
  );
}
