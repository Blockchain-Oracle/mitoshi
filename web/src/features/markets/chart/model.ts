// Ported from Owarine 90a91d71:web/src/features/markets/chart/model.ts (O-3, D-222)
/**
 * The Window chart's maths: no DOM, no React. `draw.ts` paints with it every animation frame.
 *
 * The chart is time-based, unlike the terminal's 10-second tape: x runs from a lead before the Window opens to the
 * moment it closes, so the line grows across the Window and the shaded stretch to its right is the time left. The
 * y-axis fits what is on screen plus the opening print, never less than a few basis points tall, so a quiet market
 * reads as quiet rather than as noise blown up to fill the box.
 */
import { niceStep } from "@/features/terminal/chart/engine";

export interface Span {
  fromMs: number;
  toMs: number;
}

export interface WindowTimes {
  openMs: number;
  closeMs: number;
}

export interface Series {
  t: readonly number[];
  p: readonly number[];
}

/** The lead shown before the open: half the Window, between one and fifteen minutes. */
const MIN_LEAD_MS = 60_000;
const MAX_LEAD_MS = 15 * 60_000;
/** A chart with no Window in reach shows the last quarter hour. */
export const ROLLING_MS = 15 * 60_000;
/** Room left after the close (or the live head) so its marker is not on the edge. */
const TAIL_FRACTION = 0.03;
/** Each side of the fitted range gets this much air. */
const Y_PAD = 0.16;
/** The y range never spans less than this fraction of the price (5 bp). */
const MIN_SPAN_FRACTION = 5e-4;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * The x span. A Window opening within its lead runs from that lead to its close; a static series (no live feed)
 * spans its own data; anything else — a stock Window listed overnight, or no Window — rolls the last quarter hour.
 */
export function chartSpan(times: WindowTimes | null, nowMs: number, data: Series | null, live: boolean): Span {
  if (times) {
    const len = Math.max(1, times.closeMs - times.openMs);
    const lead = clamp(len / 2, MIN_LEAD_MS, MAX_LEAD_MS);
    if (nowMs >= times.openMs - lead) return { fromMs: times.openMs - lead, toMs: times.closeMs + len * TAIL_FRACTION };
  }
  if (!live && data && data.t.length >= 2) {
    const from = data.t[0]!;
    const to = data.t[data.t.length - 1]!;
    return { fromMs: from, toMs: to + (to - from) * TAIL_FRACTION };
  }
  return { fromMs: nowMs - ROLLING_MS, toMs: nowMs + ROLLING_MS * TAIL_FRACTION };
}

/** First index with `t[i] >= at` (binary search over an ascending array). */
export function lowerBound(t: readonly number[], at: number): number {
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid]! < at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The points to draw: the backfill (prints, candles, an archive) wherever the live series has not started yet, then
 * the live series, cut to `[fromMs, untilMs]` with one point of run-in on the left so the line enters from the edge.
 */
export function assemble(backfill: Series, live: Series, fromMs: number, untilMs: number): { t: number[]; p: number[] } {
  const t: number[] = [];
  const p: number[] = [];
  const liveStart = live.t.length > 0 ? live.t[0]! : Number.POSITIVE_INFINITY;
  const push = (src: Series, start: number, stopBefore: number) => {
    for (let i = Math.max(0, start - 1); i < src.t.length; i++) {
      const at = src.t[i]!;
      if (at >= stopBefore || at > untilMs) break;
      t.push(at);
      p.push(src.p[i]!);
    }
  };
  push(backfill, lowerBound(backfill.t, fromMs), liveStart);
  push(live, lowerBound(live.t, fromMs), Number.POSITIVE_INFINITY);
  return { t, p };
}

/**
 * Keeps at most four points per pixel column — the first, lowest, highest and last, in time order (M4) — so a
 * half-hour of second samples on a 600 px plot keeps every spike without drawing thousands of segments.
 */
export function decimate(t: readonly number[], p: readonly number[], fromMs: number, msPerPx: number): { t: number[]; p: number[] } {
  if (t.length <= 2 || !(msPerPx > 0)) return { t: [...t], p: [...p] };
  const outT: number[] = [];
  const outP: number[] = [];
  let i = 0;
  while (i < t.length) {
    const col = Math.floor((t[i]! - fromMs) / msPerPx);
    let j = i;
    let lo = i;
    let hi = i;
    while (j + 1 < t.length && Math.floor((t[j + 1]! - fromMs) / msPerPx) === col) {
      j++;
      if (p[j]! < p[lo]!) lo = j;
      if (p[j]! > p[hi]!) hi = j;
    }
    for (const k of [...new Set([i, lo, hi, j])].sort((a, b) => a - b)) {
      outT.push(t[k]!);
      outP.push(p[k]!);
    }
    i = j + 1;
  }
  return { t: outT, p: outP };
}

/** The fitted y range of the values and the reference, padded, never thinner than 5 bp of the price. */
export function yRange(p: readonly number[], reference: number | null): { lo: number; hi: number } | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const v of p) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (reference !== null) {
    lo = Math.min(lo, reference);
    hi = Math.max(hi, reference);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const mid = (lo + hi) / 2;
  const span = Math.max(hi - lo, Math.abs(mid) * MIN_SPAN_FRACTION, Number.EPSILON);
  const half = (span / 2) * (1 + 2 * Y_PAD);
  return { lo: mid - half, hi: mid + half };
}

/** Price grid lines: a nice step giving about `target` lines inside the range. */
export function priceTicks(lo: number, hi: number, target = 4): { step: number; ticks: number[] } {
  const step = niceStep((hi - lo) / target);
  const ticks: number[] = [];
  if (!(step > 0) || (hi - lo) / step > 50) return { step, ticks };
  for (let k = Math.ceil(lo / step); k * step <= hi; k++) ticks.push(Number((k * step).toPrecision(12)));
  return { step, ticks };
}

const TIME_STEPS_MS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10_800, 21_600, 43_200, 86_400].map((s) => s * 1000);

/** Time grid: the smallest step that keeps labels at least `minPx` apart, aligned to whole steps. */
export function timeTicks(span: Span, plotW: number, minPx: number): { stepMs: number; ticks: number[] } {
  const msPerPx = (span.toMs - span.fromMs) / Math.max(1, plotW);
  const stepMs = TIME_STEPS_MS.find((s) => s / msPerPx >= minPx) ?? TIME_STEPS_MS[TIME_STEPS_MS.length - 1]!;
  const ticks: number[] = [];
  for (let at = Math.ceil(span.fromMs / stepMs) * stepMs; at <= span.toMs; at += stepMs) ticks.push(at);
  return { stepMs, ticks };
}

/** Display decimals for a price: cents from a dollar up, five places under a dollar (as `usdLine`), three significant below a cent. */
export function displayDecimals(price: number): number {
  const a = Math.abs(price);
  if (a >= 1) return 2;
  if (a >= 0.01) return 5;
  if (a === 0) return 2;
  return Math.min(10, 3 - Math.floor(Math.log10(a)));
}

/** Cuts to `dp` places toward zero, as the copy's `formatOracleRaw` does, so the chart and the headline never differ by a rounding. */
export function truncate(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.trunc(v * f + Math.sign(v) * 1e-7) / f;
}

/** An axis label's decimals: as many as the grid step needs, no more. */
export const stepDecimals = (step: number): number => clamp(-Math.floor(Math.log10(step) + 1e-9), 0, 10);

/**
 * Monotone cubic tangents (Fritsch–Carlson): the curve through the points never overshoots them, so the smoothing
 * cannot invent a high or a low the price never printed.
 */
export function monotoneTangents(xs: ArrayLike<number>, ys: ArrayLike<number>, n: number): Float64Array {
  const m = new Float64Array(n);
  if (n < 2) return m;
  const d = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1]! - xs[i]!;
    d[i] = dx === 0 ? 0 : (ys[i + 1]! - ys[i]!) / dx;
  }
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d[i]!;
    const b = m[i + 1]! / d[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i]!;
      m[i + 1] = tau * b * d[i]!;
    }
  }
  return m;
}

/** A label's alpha by its distance (px) from something it must not cover: hidden inside `gap`, full past `gap + 12`. */
export const clearance = (distancePx: number, gap: number): number => clamp((distancePx - gap) / 12, 0, 1);

/**
 * Where the reference tag sits on the axis: at its line, unless the live pill is there, in which case it steps to
 * the far side of the pill so neither number is covered.
 */
export function tagY(refY: number, headY: number | null, tagH: number, pillH: number, top: number, bottom: number): number {
  const half = tagH / 2;
  if (headY === null) return clamp(refY, top + half, bottom - half);
  const gap = (tagH + pillH) / 2 + 3;
  if (Math.abs(refY - headY) >= gap) return clamp(refY, top + half, bottom - half);
  const above = headY - gap;
  const below = headY + gap;
  const preferAbove = refY <= headY;
  const fitsAbove = above - half >= top;
  const fitsBelow = below + half <= bottom;
  return preferAbove ? (fitsAbove ? above : below) : fitsBelow ? below : above;
}
