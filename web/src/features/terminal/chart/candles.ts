// Ported from Owarine ecb7565b:web/src/features/terminal/chart/candles.ts — unchanged but for this header (S23b).
/**
 * The candle view's maths, to Tradash's (`CandleSeries`, `CandleViewport`; canton-season3 context/13-revamp/tradash/SPEC-chart.md §4):
 * closed history from ops `/prices/candles` plus the forming candle built from live ticks — its high and low follow the
 * raw ticks, its close follows the eased price — rolling over at each bucket with a one-slot slide-in that decays ×0.86
 * a frame. Pure.
 */

export type CandleInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "12h" | "1d";
export const CANDLE_INTERVALS: readonly CandleInterval[] = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "12h", "1d"];
export const MINUTE_INTERVALS: readonly CandleInterval[] = ["1m", "3m", "5m", "15m", "30m"];
export const HOUR_INTERVALS: readonly CandleInterval[] = ["1h", "2h", "4h", "12h", "1d"];
export const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000, "12h": 43_200_000, "1d": 86_400_000,
};

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Most closed candles kept. */
export const CANDLE_CAP = 3_000;
/** The slide-in decays this much a frame. */
export const SLIDE_DECAY = 0.86;
/** Default px per candle: plot width / 48, clamped; pinch range. */
export const SPACING_MIN = 1.5;
export const SPACING_MAX = 40;
export const defaultSpacing = (plotW: number): number => Math.min(14, Math.max(5, plotW / 48));
export const bodyWidth = (spacing: number): number => Math.max(1, Math.round(0.64 * spacing));

export class CandleSeries {
  closed: Candle[] = [];
  forming: Candle | null = null;
  /** 1 right after a rollover, decaying to 0: the newest candle slides in from the right. */
  slide = 0;

  constructor(readonly intervalMs: number) {}

  /** Merges fetched candles (any order, overlapping allowed); the bucket still forming stays live. */
  merge(rows: readonly Candle[], nowMs: number): void {
    const current = Math.floor(nowMs / this.intervalMs) * this.intervalMs;
    const byT = new Map(this.closed.map((c) => [c.t, c]));
    for (const r of rows) {
      if (r.t >= current) {
        if (!this.forming || this.forming.t === r.t) this.forming = { ...r, ...(this.forming ? { h: Math.max(r.h, this.forming.h), l: Math.min(r.l, this.forming.l), c: this.forming.c } : {}) };
        continue;
      }
      byT.set(r.t, { ...r });
    }
    this.closed = [...byT.values()].sort((a, b) => a.t - b.t).slice(-CANDLE_CAP);
  }

  /** A live tick: `raw` moves the high/low, `eased` is the close the eye follows. */
  update(raw: number, eased: number, nowMs: number): void {
    const bucket = Math.floor(nowMs / this.intervalMs) * this.intervalMs;
    if (!this.forming || bucket > this.forming.t) {
      if (this.forming) {
        this.closed.push(this.forming);
        if (this.closed.length > CANDLE_CAP) this.closed.shift();
        this.slide = 1;
      }
      const open = this.forming?.c ?? eased;
      this.forming = { t: bucket, o: open, h: Math.max(open, raw), l: Math.min(open, raw), c: eased };
      return;
    }
    this.forming.h = Math.max(this.forming.h, raw);
    this.forming.l = Math.min(this.forming.l, raw);
    this.forming.c = eased;
  }

  decay(k = SLIDE_DECAY): void {
    this.slide = this.slide < 0.002 ? 0 : this.slide * k;
  }

  /** k-th candle from the newest (0 = forming). */
  at(k: number): Candle | null {
    if (k === 0) return this.forming;
    return this.closed[this.closed.length - k] ?? null;
  }

  get count(): number {
    return this.closed.length + (this.forming ? 1 : 0);
  }

  get oldestT(): number | null {
    return this.closed[0]?.t ?? this.forming?.t ?? null;
  }
}

/** Slot x of the k-th newest candle: `plotW − spacing·(0.5 + k − offset) + slide·spacing`. */
export const slotX = (k: number, plotW: number, spacing: number, offset: number, slide: number): number => plotW - spacing * (0.5 + k - offset) + slide * spacing;

/** How many candles fit, and which k range is on screen. */
export function visibleRange(plotW: number, spacing: number, offset: number): { from: number; to: number } {
  const slots = Math.ceil(plotW / spacing) + 2;
  return { from: Math.max(0, Math.floor(offset) - 1), to: Math.floor(offset) + slots };
}

/** Auto y-step from the visible bodies (Tradash: nice(max(2·dev·1.15, 0.15 % of price) / 15)). */
export function candleStep(bodies: ReadonlyArray<{ o: number; c: number }>, price: number, nice: (x: number) => number): number {
  let dev = 0;
  for (const b of bodies) dev = Math.max(dev, Math.abs(b.o - price), Math.abs(b.c - price));
  return nice(Math.max(2 * dev * 1.15, 1e-4 * price * 15) / 15);
}

/** The crosshair's snap point: a candle slot and a price bucket of step/5. */
export function detent(x: number, y: number, plotW: number, spacing: number, offset: number, slide: number, priceAt: (y: number) => number, step: number): { k: number; price: number } {
  const k = Math.max(0, Math.round((plotW + slide * spacing - x) / spacing - 0.5 + offset));
  const bucket = step / 5;
  return { k, price: Math.round(priceAt(y) / bucket) * bucket };
}
