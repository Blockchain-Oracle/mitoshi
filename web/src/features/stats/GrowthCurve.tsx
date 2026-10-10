// Ported from Masayume 68f7a09:web/src/features/stats/GrowthCurve.tsx (itself Yosuku's `GrowthCurve`): the cumulative
// callers curve — the slope is the story. One point renders as a dot, two or more as a line over a gradient fill, no
// smoothing. Mitoshi's change: the axis words and the scale live in HTML around the SVG, so the non-uniform viewBox
// stretch never distorts text; the colours come from tokens through `currentColor`.
import { STATS } from "./copy";

interface GrowthCurveProps {
  points: readonly { label: string; cumulative: number }[];
  height?: number;
}

export function GrowthCurve({ points, height = 200 }: GrowthCurveProps) {
  if (points.length === 0) return <p className="type-body text-ink-secondary">{STATS.curve.empty}</p>;
  const W = 920;
  const H = height;
  const padX = 8;
  const padT = 12;
  const padB = 8;
  const max = Math.max(1, ...points.map((p) => p.cumulative));
  const xAt = (i: number) => (points.length === 1 ? W / 2 : padX + (i / (points.length - 1)) * (W - 2 * padX));
  const yAt = (v: number) => H - padB - (v / max) * (H - padT - padB);
  const pts = points.map((p, i) => ({ x: xAt(i), y: yAt(p.cumulative) }));
  const line = pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ");
  const lastX = points.length === 1 ? W / 2 : W - padX;
  const area = `${padX},${H - padB} ${line} ${lastX.toFixed(1)},${H - padB}`;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between type-label-micro text-ink-secondary">
        <span>Wallets</span>
        <span className="tabular-nums text-ink">{max.toLocaleString("en-US")}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-accent" style={{ height }} preserveAspectRatio="none" role="img" aria-label={STATS.curve.aria(first.label, last.label, last.cumulative)}>
        <defs>
          <linearGradient id="stats-gc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={padX} x2={W - padX} y1={padT + g * (H - padT - padB)} y2={padT + g * (H - padT - padB)} stroke="var(--color-hairline)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <polygon points={area} fill="url(#stats-gc)" stroke="none" />
        {pts.length > 1 ? <polyline points={line} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null}
        {pts.length === 1 ? <circle cx={pts[0]!.x} cy={pts[0]!.y} r={5} fill="currentColor" /> : null}
      </svg>
      <figcaption className="flex justify-between type-caption text-ink-secondary">
        <span>{first.label}</span>
        <span>{last.label}</span>
      </figcaption>
    </figure>
  );
}
