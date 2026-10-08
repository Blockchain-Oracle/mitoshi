// Ported from Owarine ecb7565b:web/src/features/terminal/chart/engine.ts — unchanged but for this header (S23b, D-199).
/**
 * The live chart's maths, to Tradash's model (canton-season3 context/13-revamp/tradash/SPEC-chart.md; reconstructed from their
 * shipped bundle). Pure: no DOM, no React. `chart-engine.ts` draws with it every animation frame.
 *
 * The line is not time-based: every frame the eased price is pushed into a 600-sample ring, so the plot is the last
 * ~10 s of motion at the right edge, and the y-axis is re-centred on the eased price every frame at a fixed ±7.5 steps
 * (one step ≈ 0.01 % of price, frozen when the chart resets). Two deliberate fixes over the reference: easing and
 * sampling run on a 60 Hz clock whatever the display's refresh rate (theirs halve the window on a 120 Hz screen).
 */

/** Samples kept on screen; ~10 s at the 60 Hz sample clock. */
export const SAMPLE_CAPACITY = 600;
export const SAMPLE_MS = 1000 / 60;
/** Per-sample approach of the eased price to the latest tick (Tradash's 0.18 a frame at 60 Hz: τ ≈ 84 ms). */
export const PRICE_EASE = 0.18;
/** Per-sample approach of a rolling digit (0.22) and its snap threshold. */
export const DIGIT_EASE = 0.22;
export const DIGIT_SNAP = 0.002;
/** The plot spans this many grid steps top to bottom, centred on the price. */
export const SPAN_STEPS = 15;
/** One step ≈ this fraction of price before rounding to a nice number. */
export const STEP_FRACTION = 1e-4;
/** The left fraction of the plot that fades out (alpha 1 → .55 at 45 % of it → 0). */
export const FADE_FRACTION = 0.32;

/** `k` per frame of `dtMs`, equivalent to `perSample` applied once per 60 Hz sample. */
export const easeFor = (perSample: number, dtMs: number): number => 1 - (1 - perSample) ** (Math.max(0, dtMs) / SAMPLE_MS);

/** Tradash's nice step: 1, 2, 5 or 10 × 10ⁿ with cut-offs 1.5 / 3.5 / 7.5. */
export function niceStep(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 1;
  const pow = 10 ** Math.floor(Math.log10(x));
  const m = x / pow;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * pow;
}

/** The frozen grid step for a price (0.01 % of it, made nice). */
export const stepFor = (price: number): number => niceStep(STEP_FRACTION * Math.abs(price));

/** Display decimals by magnitude: ≥1e5 → 1, ≥1e3 → 2, ≥10 → 3, ≥0.01 → 4, smaller → enough to show 3 significant. */
export function priceDecimals(price: number): number {
  const a = Math.abs(price);
  if (a >= 1e5) return 1;
  if (a >= 1e3) return 2;
  if (a >= 10) return 3;
  if (a >= 0.01) return 4;
  if (a === 0) return 2;
  return Math.min(10, 3 - Math.floor(Math.log10(a)));
}

/** A grid label's decimals: the price's, or more when the step is finer. */
export function labelDecimals(price: number, step: number): number {
  return Math.max(priceDecimals(price), Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
}

/** One formatter per decimal count: `toLocaleString` with options builds a new one per call (~15 µs), and the chart
 * formats 16–20 labels a frame. A cached `Intl.NumberFormat` is ~0.4 µs. */
const formatters = new Map<number, Intl.NumberFormat>();
const formatterFor = (decimals: number): Intl.NumberFormat => {
  let f = formatters.get(decimals);
  if (!f) formatters.set(decimals, (f = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })));
  return f;
};

export function formatPrice(price: number, decimals = priceDecimals(price)): string {
  return formatterFor(decimals).format(price);
}

export const formatUsd = (price: number, decimals?: number): string => `$${formatPrice(price, decimals)}`;

/** Signed money with a true minus: "+$1,234.56" / "−$3.20". */
export function formatSigned(value: number, decimals = 2): string {
  const sign = value < 0 ? "−" : "+";
  return `${sign}$${formatterFor(decimals).format(Math.abs(value))}`;
}

/** A ring of the last `capacity` samples, oldest first when read. */
export class SampleRing {
  readonly capacity: number;
  private buf: Float64Array;
  private start = 0;
  private size = 0;

  constructor(capacity = SAMPLE_CAPACITY) {
    this.capacity = capacity;
    this.buf = new Float64Array(capacity);
  }

  get length(): number {
    return this.size;
  }

  push(v: number): void {
    if (this.size < this.capacity) {
      this.buf[(this.start + this.size) % this.capacity] = v;
      this.size += 1;
    } else {
      this.buf[this.start] = v;
      this.start = (this.start + 1) % this.capacity;
    }
  }

  /** Fills the ring with one value (the first price: the chart starts flat and grows movement from the right). */
  fill(v: number): void {
    this.buf.fill(v);
    this.start = 0;
    this.size = this.capacity;
  }

  at(i: number): number {
    return this.buf[(this.start + i) % this.capacity]!;
  }

  clear(): void {
    this.start = 0;
    this.size = 0;
  }
}

/** The plot's vertical window: centred on `center`, `SPAN_STEPS` steps tall, inside `[top, bottom]` CSS px. */
export interface YWindow {
  center: number;
  half: number;
  top: number;
  bottom: number;
}

export const yOf = (price: number, w: YWindow): number => {
  const mid = (w.top + w.bottom) / 2;
  return mid - ((price - w.center) / w.half) * ((w.bottom - w.top) / 2);
};

/**
 * Uniform Catmull-Rom → cubic Bézier control points (tension 1/6, endpoints duplicated) for segment i→i+1 of
 * points `(x(i), y(i))`. Returned as `[c1x, c1y, c2x, c2y]`.
 */
export function catmullRom(xs: ArrayLike<number>, ys: ArrayLike<number>, i: number): [number, number, number, number] {
  const n = xs.length;
  const a = Math.max(0, i - 1);
  const d = Math.min(n - 1, i + 2);
  const b = i;
  const c = i + 1;
  return [xs[b]! + (xs[c]! - xs[a]!) / 6, ys[b]! + (ys[c]! - ys[a]!) / 6, xs[c]! - (xs[d]! - xs[b]!) / 6, ys[c]! - (ys[d]! - ys[b]!) / 6];
}

/** Grid ticks: a minor every step/5, a major every step, across `[lo, hi]`; empty past 400 ticks. */
export function gridTicks(lo: number, hi: number, step: number): Array<{ value: number; major: boolean }> {
  const minor = step / 5;
  if (!(minor > 0) || (hi - lo) / minor > 400) return [];
  const out: Array<{ value: number; major: boolean }> = [];
  const first = Math.ceil(lo / minor);
  for (let k = first; k * minor <= hi + 1e-9 * Math.abs(hi); k++) out.push({ value: Number((k * minor).toFixed(10)), major: k % 5 === 0 });
  return out;
}

/**
 * One rolling digit slot of the canvas odometer. A change moves `target` by the mod-10 distance, forward on a rise and
 * backward on a fall (9 → 0 on a rise rolls up through 0), and `cur` eases to it.
 */
export function rollTarget(cur: number, digitNow: number, digitNext: number, direction: 1 | -1 | 0): number {
  const fwd = (digitNext - digitNow + 10) % 10;
  const back = fwd === 0 ? 0 : fwd - 10;
  const delta = direction > 0 ? fwd : direction < 0 ? back : Math.abs(back) < fwd ? back : fwd;
  return cur + delta;
}

/** The digit shown at a fractional roll position, and the next one, with how far between them (0..1). */
export function rollFrame(cur: number): { digit: number; next: number; frac: number } {
  const base = Math.floor(cur);
  return { digit: ((base % 10) + 10) % 10, next: (((base + 1) % 10) + 10) % 10, frac: cur - base };
}

/** Alpha for a label near a plot edge or the pill: fades over 14 px. */
export const edgeAlpha = (distancePx: number): number => Math.min(1, Math.max(0, distancePx / 14));
