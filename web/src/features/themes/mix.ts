// A theme's weighted mix over time (R6, D-230; D-231 on baskets): every stock at its weight from the first hour all of
// them traded, as an index that starts at 100 — the basket's move, not a follower's P&L (a follower holds calls, not
// shares). Prices are ops' display candles (`/prices/candles`, Alpaca for stocks): a view, never a settling value
// (D-196). A stock without candles leaves no series at all — the mix is never drawn with a stock missing or filled in.

/** `[tMs, open, high, low, close]`, oldest first (ops' wire). */
export type Candle = readonly [number, number, number, number, number];
export interface MixPoint {
  tMs: number;
  /** The index: 100 at the range's first point. Floats only here, at the drawing edge. */
  value: number;
}
export interface MixMember {
  symbol: string;
  weightBps: number;
}
/** One range's line, or the stocks it couldn't draw without. */
export interface MixLine {
  points: MixPoint[];
  missing: string[];
}

/** Hourly candles cover a month (ops serves ≤ 300 a read: ~40 sessions); daily ones a year and more. */
export const MIX_RANGES = [
  { id: "1w", label: "1W", days: 7, interval: "1h" },
  { id: "1m", label: "1M", days: 30, interval: "1h" },
  { id: "3m", label: "3M", days: 90, interval: "1d" },
  { id: "1y", label: "1Y", days: 365, interval: "1d" },
] as const;
export type MixRangeId = (typeof MIX_RANGES)[number]["id"];
export type MixInterval = (typeof MIX_RANGES)[number]["interval"];
export type MixSeries = Record<MixRangeId, MixLine>;
export const CANDLE_COUNT = 300;
const DAY_MS = 86_400_000;

type CandleSet = Readonly<Record<string, readonly Candle[] | null | undefined>>;

/** The mix from `sinceMs` on, on the hours every stock traded; empty (with the stocks missing) when one has none. */
export function mixSeries(members: readonly MixMember[], candles: CandleSet, sinceMs: number): MixLine {
  const missing = members.filter((m) => !candles[m.symbol]?.length).map((m) => m.symbol);
  if (members.length === 0 || missing.length > 0) return { points: [], missing };
  const closes = members.map((m) => new Map(candles[m.symbol]!.filter((c) => c[0] >= sinceMs && c[4] > 0).map((c) => [c[0], c[4]])));
  const hours = [...closes[0]!.keys()].filter((t) => closes.every((m) => m.has(t))).sort((a, b) => a - b);
  if (hours.length === 0) return { points: [], missing: [] };
  const first = closes.map((m) => m.get(hours[0]!)!);
  const total = members.reduce((s, m) => s + m.weightBps, 0);
  if (total <= 0) return { points: [], missing: [] };
  const points = hours.map((t) => ({ tMs: t, value: (100 * members.reduce((s, m, i) => s + m.weightBps * (closes[i]!.get(t)! / first[i]!), 0)) / total }));
  return { points, missing: [] };
}

/** The series' move first → last in basis points; null under two points. */
export function mixMoveBps(points: readonly MixPoint[]): number | null {
  if (points.length < 2 || points[0]!.value <= 0) return null;
  return Math.round(((points.at(-1)!.value - points[0]!.value) / points[0]!.value) * 10_000);
}

/** The move from the range's first point to `point`, in basis points (the chart's scrub readout). */
export function moveToBps(points: readonly MixPoint[], point: MixPoint): number | null {
  const base = points[0]?.value ?? 0;
  return base > 0 ? Math.round(((point.value - base) / base) * 10_000) : null;
}

/** The range's first instant: `days` before now (a weekend's week holds its five sessions). */
export function rangeStart(nowMs: number, days: number): number {
  return nowMs - days * DAY_MS;
}

/** Each range's series from the stocks' candles by interval. */
export function mixByRange(members: readonly MixMember[], candles: Readonly<Record<MixInterval, CandleSet>>, nowMs: number): MixSeries {
  return Object.fromEntries(MIX_RANGES.map((r) => [r.id, mixSeries(members, candles[r.interval], rangeStart(nowMs, r.days))])) as MixSeries;
}

/** Σ weight × each stock's last close: the basket's weighted price; null until every stock has a close. */
export function weightedPrice(members: readonly MixMember[], candles: CandleSet): number | null {
  const total = members.reduce((s, m) => s + m.weightBps, 0);
  if (members.length === 0 || total <= 0) return null;
  let sum = 0;
  for (const m of members) {
    const last = candles[m.symbol]?.at(-1)?.[4];
    if (!last || last <= 0) return null;
    sum += m.weightBps * last;
  }
  return sum / total;
}

/** At most `max` points for drawing, the first and last always kept (the readout reads these same points). */
export function thinPoints<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max || max < 2) return [...points];
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]!);
}
