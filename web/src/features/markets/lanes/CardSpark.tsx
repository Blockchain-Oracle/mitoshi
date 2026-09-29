// Ported from Masayume 68f7a09:web/src/features/markets/lanes/CardSpark.tsx — the card's sparkline as SVG (no canvas per
// card), the dashed strike rule in the same scale, coloured by which side of the line the price is on.
import { LANE_CARD } from "../copy";
import type { ChartPoint } from "../data/useChartSeries";

const VIEW_W = 100;
const VIEW_H = 40;

export function sparkPlot(points: readonly ChartPoint[], openingRaw: bigint | null) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.valueRaw);
  let low = values.reduce((a, b) => (a < b ? a : b));
  let high = values.reduce((a, b) => (a > b ? a : b));
  if (openingRaw !== null) {
    if (openingRaw < low) low = openingRaw;
    if (openingRaw > high) high = openingRaw;
  }
  const span = high - low;
  const y = (v: bigint) => (span === 0n ? VIEW_H / 2 : VIEW_H - (Number(((v - low) * 1000n) / span) / 1000) * VIEW_H);
  const x = (i: number) => (i / (points.length - 1)) * VIEW_W;
  const latest = points.at(-1)!.valueRaw;
  return {
    path: points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.valueRaw).toFixed(2)}`).join(" "),
    strikeTopPct: openingRaw === null ? null : (y(openingRaw) / VIEW_H) * 100,
    winning: openingRaw === null ? latest >= points[0]!.valueRaw : latest >= openingRaw,
  };
}

export function CardSpark({ points, openingRaw }: { points: readonly ChartPoint[]; openingRaw: bigint | null }) {
  const shape = sparkPlot(points, openingRaw);
  if (!shape) return null;
  return (
    <>
      <svg className="mc-spark-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden focusable="false">
        <path className={shape.winning ? "mc-spark-line up" : "mc-spark-line down"} d={shape.path} />
      </svg>
      {shape.strikeTopPct !== null && (
        <>
          <div className="strike-line" style={{ top: `${shape.strikeTopPct}%` }} aria-hidden />
          <div className="strike-tick" style={{ top: `${shape.strikeTopPct}%` }} aria-hidden>
            {LANE_CARD.line}
          </div>
        </>
      )}
    </>
  );
}
