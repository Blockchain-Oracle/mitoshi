// The candle chart's geometry (R6 money, S02; D-230) — split from `candle-chart.tsx` (From 21st.dev 20107
// ssychui/candle-chart) so the drawing stays under 400 lines and the maths is plain functions: the price band around
// the visible candles (21st's "pinned" mode — a band, never a 0-based axis that prints gridlines no trade touched), the
// slot each candle takes, the price-to-y map and four ticks. Numbers here are for drawing only; money stays bigints.

export interface ChartCandle {
  /** Bucket start, epoch ms. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Quote traded in the bucket (any unit; bars are relative). */
  v: number;
}

export interface CandleLayout {
  plotW: number;
  plotH: number;
  volTop: number;
  volH: number;
  slot: number;
  bodyW: number;
  lo: number;
  hi: number;
  maxVolume: number;
  xMid: (i: number) => number;
  y: (price: number) => number;
  ticks: number[];
}

export const AXIS_W = 64;
const VOL_SHARE = 0.18;
const GAP = 8;
/** A candle never draws wider than this (one trade on a wide pane is a mark, not a slab). */
const MAX_BODY = 14;

export function layoutCandles(candles: readonly ChartCandle[], width: number, height: number): CandleLayout {
  const plotW = Math.max(1, width - AXIS_W);
  const volH = Math.round(height * VOL_SHARE);
  const plotH = Math.max(1, height - volH - GAP);
  const n = Math.max(1, candles.length);
  const slot = plotW / Math.max(n, 12);
  const bodyW = Math.min(MAX_BODY, Math.max(1, slot * 0.6));
  const highs = candles.map((k) => k.h);
  const lows = candles.map((k) => k.l);
  const maxH = highs.length ? Math.max(...highs) : 1;
  const minL = lows.length ? Math.min(...lows) : 0;
  const mid = (maxH + minL) / 2;
  // A flat series (one price) still gets a band: ±5 % of its price, so the candle sits mid-pane.
  const half = Math.max((maxH - minL) / 2, Math.abs(mid) * 0.05, Number.EPSILON) * 1.08;
  const hi = mid + half;
  const lo = Math.max(0, mid - half);
  const y = (price: number) => (1 - (price - lo) / (hi - lo || 1)) * plotH;
  // Right-aligned: the newest candle sits at the right edge however few there are.
  const offset = plotW - slot * n;
  const xMid = (i: number) => Math.max(0, offset) + i * slot + slot / 2;
  return {
    plotW, plotH, volTop: plotH + GAP, volH, slot, bodyW, lo, hi,
    maxVolume: Math.max(1e-12, ...candles.map((k) => k.v)),
    xMid, y,
    ticks: [hi - (hi - lo) * 0.08, mid + half / 3, mid - half / 3, lo + (hi - lo) * 0.08],
  };
}

/** The candle under an x (in the layout's units), or null off the series. */
export function candleAt(layout: CandleLayout, x: number, n: number): number | null {
  if (n === 0) return null;
  let best = 0;
  for (let i = 1; i < n; i++) if (Math.abs(layout.xMid(i) - x) < Math.abs(layout.xMid(best) - x)) best = i;
  return best;
}
