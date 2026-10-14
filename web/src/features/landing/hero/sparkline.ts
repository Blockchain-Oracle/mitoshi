// The hero line's geometry (R6 landing L01), pure so it's tested: points → an SVG path in a box, the y-scale padded
// around the line and the Window's opening print (so the dashed line always sits inside), the last point for the dot.
// Numbers only draw: the prices on screen come from the E8 text through `printUsd`.

export interface LinePoint {
  t: number;
  /** Dollars, for drawing only. */
  p: number;
}

export interface LineGeometry {
  d: string;
  /** The opening print's y, or null with no print. */
  openY: number | null;
  /** The newest point. */
  last: { x: number; y: number } | null;
  min: number;
  max: number;
  /** Three y labels, top to bottom: [value, y]. */
  labels: [number, number][];
}

const PAD = 0.12;

export function lineGeometry(points: readonly LinePoint[], width: number, height: number, open: number | null, spanMs: number, nowMs: number): LineGeometry {
  const fromMs = nowMs - spanMs;
  const shown = points.filter((pt) => pt.t >= fromMs && pt.t <= nowMs && Number.isFinite(pt.p) && pt.p > 0);
  const values = shown.map((pt) => pt.p);
  if (open !== null) values.push(open);
  if (values.length === 0) return { d: "", openY: null, last: null, min: 0, max: 0, labels: [] };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < max * 1e-5) {
    const half = Math.max(max * 5e-5, 0.01);
    min -= half;
    max += half;
  }
  const pad = (max - min) * PAD;
  min -= pad;
  max += pad;
  const y = (v: number) => height - ((v - min) / (max - min)) * height;
  const x = (t: number) => ((t - fromMs) / spanMs) * width;
  const d = shown.map((pt, i) => `${i === 0 ? "M" : "L"}${x(pt.t).toFixed(1)},${y(pt.p).toFixed(1)}`).join("");
  const tail = shown.at(-1);
  const mid = (min + max) / 2;
  return {
    d,
    openY: open === null ? null : y(open),
    last: tail ? { x: x(tail.t), y: y(tail.p) } : null,
    min,
    max,
    labels: [max - pad, mid, min + pad].map((v) => [v, y(v)]),
  };
}

/** Thins a dense ring to at most `max` points (keeps the newest), for the first paint's path. */
export function thin<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return [...points];
  const step = points.length / max;
  const out: T[] = [];
  for (let i = 0; i < max - 1; i += 1) out.push(points[Math.floor(i * step)]!);
  out.push(points.at(-1)!);
  return out;
}

/**
 * One point per time bucket, the bucket's mean: the feed interleaves its sources a few dollars apart, which a raw line
 * draws as spikes on a tight scale. The newest point is kept as it is, so the line ends on the live price.
 */
export function smooth(points: readonly LinePoint[], fromMs: number, spanMs: number, buckets: number): LinePoint[] {
  const size = spanMs / buckets;
  const sums = new Map<number, { t: number; sum: number; n: number }>();
  for (const pt of points) {
    if (pt.t < fromMs) continue;
    const k = Math.floor((pt.t - fromMs) / size);
    const b = sums.get(k) ?? { t: 0, sum: 0, n: 0 };
    b.t = Math.max(b.t, pt.t);
    b.sum += pt.p;
    b.n += 1;
    sums.set(k, b);
  }
  const out = [...sums.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => ({ t: b.t, p: b.sum / b.n }));
  const last = points.at(-1);
  if (last && out.length > 0) out[out.length - 1] = last;
  return out;
}
