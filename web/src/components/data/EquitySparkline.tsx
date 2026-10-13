// Ported from Owarine 90a91d71:web/src/features/markets/history/EquitySparkline.tsx (R4-2, D-227; automate spec step 1):
// the cumulative net, oldest → newest, one step per settled round. It rises on wins and DROPS on losses — the drawdown
// is drawn, never hidden. Vermilion is the only accent; below zero the line is muted, so a loss reads as a fact, not a
// scare. Money stays in base units (bigint) to the last step; the words are the caller's. Colours live in
// `styles/equity.css` (design-literals rule), sized by viewBox so it fills its slot.
import type { EquityPoint } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import { useId } from "react";
import { cn } from "@/lib/utils";
import "@/styles/equity.css";

export interface EquitySparklineProps {
  points: readonly EquityPoint[];
  decimals: number;
  /** The empty line, and the curve's accessible name from its direction and the net amount. */
  labels: { empty: string; curve: (direction: "up" | "down", amount: string) => string };
  className?: string;
}

const WIDTH = 300;
const HEIGHT = 72;
const PAD = 3;

export function EquitySparkline({ points, decimals, labels, className }: EquitySparklineProps) {
  const gradientId = useId().replace(/:/g, "");
  // The seed point at zero only counts as a series once something has settled after it.
  const series = points.length < 2 ? [] : points;
  if (series.length === 0) {
    return (
      <div className={cn("equity-empty type-label-micro", className)}>
        <span>{labels.empty}</span>
      </div>
    );
  }

  const values = series.map((point) => point.cumulativeBase);
  let low = values.reduce((min, v) => (v < min ? v : min), 0n);
  let high = values.reduce((max, v) => (v > max ? v : max), 0n);
  if (high === low) {
    high += 1n;
    low -= 1n;
  }
  const span = Number(high - low);
  const count = series.length;
  const x = (i: number) => PAD + (i / (count - 1)) * (WIDTH - PAD * 2);
  const y = (v: bigint) => PAD + (1 - Number(v - low) / span) * (HEIGHT - PAD * 2);
  const zeroY = y(0n);
  const linePoints = series.map((point, i) => `${x(i).toFixed(2)},${y(point.cumulativeBase).toFixed(2)}`);
  const linePath = `M ${linePoints.join(" L ")}`;
  const areaPath = `${linePath} L ${x(count - 1).toFixed(2)},${zeroY.toFixed(2)} L ${x(0).toFixed(2)},${zeroY.toFixed(2)} Z`;
  const last = series[count - 1] as EquityPoint;
  const up = last.cumulativeBase >= 0n;
  const amount = formatBaseUnits(last.cumulativeBase < 0n ? -last.cumulativeBase : last.cumulativeBase, decimals);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={labels.curve(up ? "up" : "down", amount)} className={cn("equity-spark", up ? "is-up" : "is-down", className)}>
      <defs>
        <linearGradient id={`fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="equity-fill-start" />
          <stop offset="100%" className="equity-fill-end" />
        </linearGradient>
      </defs>
      <line x1={PAD} x2={WIDTH - PAD} y1={zeroY} y2={zeroY} className="equity-zero" strokeDasharray="2 3" />
      <path d={areaPath} fill={`url(#fill-${gradientId})`} />
      <path d={linePath} fill="none" className="equity-line" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(count - 1)} cy={y(last.cumulativeBase)} r="2.6" className="equity-dot" />
      <circle cx={x(count - 1)} cy={y(last.cumulativeBase)} r="5" fill="none" className="equity-halo" />
    </svg>
  );
}
