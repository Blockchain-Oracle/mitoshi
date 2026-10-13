// The weighted mix's line, drawn (R6, D-230 — from 21st.dev 30538 ssychui/balance-chart): the plain-SVG area under a
// line whose colour follows the trend, the fill fading to nothing. The geometry the chart and the card's spark share;
// no imports, so the chart island carries nothing else with it.
import type { MixPoint } from "./mix";

const W = 640;
const H = 200;
const TOP = 22;
const BOTTOM = 18;

/** The plot's geometry in a 640 × 200 box: the line, the area under it, and where the high and the low fall. */
export function sparkGeometry(points: readonly MixPoint[]) {
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * W;
  const y = (v: number) => H - BOTTOM - ((v - lo) / (hi - lo || 1)) * (H - TOP - BOTTOM);
  const xy = points.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const line = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return { xy, line, area: `${line} L${W},${H} L0,${H} Z`, iHi: vals.indexOf(hi), iLo: vals.indexOf(lo), W, H };
}

/** The line and its fading area in a stretched SVG; `hue` is the trend's token. */
export function SparkPaths({ points, hue, id, fill = 0.18 }: { points: readonly MixPoint[]; hue: string; id: string; fill?: number }) {
  const g = sparkGeometry(points);
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hue} stopOpacity={fill} />
          <stop offset="100%" stopColor={hue} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={g.area} fill={`url(#${id})`} />
      <path d={g.line} fill="none" stroke={hue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </>
  );
}

/** A card's week as a spark: no axis, no scrub (the card is a link). */
export function MixSpark({ points, moveBps, id }: { points: readonly MixPoint[]; moveBps: number | null; id: string }) {
  if (points.length < 2) return null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="th-spark" aria-hidden>
      <SparkPaths points={points} hue={(moveBps ?? 0) < 0 ? "var(--color-down)" : "var(--color-up)"} id={`th-spark-${id}`} />
    </svg>
  );
}
