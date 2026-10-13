// Ported from Owarine 90a91d71:web/src/components/ui/desk-kit/charts.tsx (R4-2, D-227) — the desk kit's small charts,
// adapted there from 21st (Traffic Source Donut #29204 redrawn in SVG, Partition Bar #26545, Progress radial #3424, Mini
// Chart #9613 as a line, Avatar Stack #28355 with the asset marks), here on Mitoshi's tokens. The draw-ins are CSS
// (stroke dash and flex-grow transitions keyed off custom properties) instead of a motion runtime; reduced motion draws
// them at once. Sizes are numbers (SVG user units), never px strings.
import type { CSSProperties, ReactNode } from "react";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { cn } from "@/lib/utils";

export interface Slice {
  id: string;
  label: string;
  /** Any unit; slices are drawn as shares of the sum. */
  value: number;
  /** A CSS colour, by token (`var(--color-accent)`). */
  color: string;
}

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** A ring of slices with a figure in the middle; the arcs draw in on mount and glide when a value changes. */
export function Donut({ slices, size = 160, thickness = 16, children, label }: { slices: readonly Slice[]; size?: number; thickness?: number; children?: ReactNode; label: string }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="dkit-donut" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="dkit-turn">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="dkit-ring" strokeWidth={thickness} />
        {total > 0 &&
          slices.map((s) => {
            const len = (Math.max(0, s.value) / total) * c;
            const dash = Math.max(0, len - gap);
            const start = offset;
            offset += len;
            return <circle key={s.id} cx={size / 2} cy={size / 2} r={r} fill="none" className="dkit-arc" stroke={s.color} strokeWidth={thickness} strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-start} style={vars({ "--dkit-c": c })} />;
          })}
      </svg>
      {children ? <div className="dkit-donut-center">{children}</div> : null}
    </div>
  );
}

/** One bar split into slices, each growing to its share. */
export function PartitionBar({ slices, height = 12, warn = false, label }: { slices: readonly Slice[]; height?: number; warn?: boolean; label: string }) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  return (
    <div className="dkit-partition" data-warn={warn ? "" : undefined} style={{ height }} role="img" aria-label={label}>
      {total > 0 &&
        slices
          .filter((s) => s.value > 0)
          .map((s) => <span key={s.id} className="dkit-partition-seg" style={{ background: s.color, flexGrow: s.value / total }} title={s.label} />)}
    </div>
  );
}

/** A circular gauge, 0–100, tinted by how close it is to full. */
export function RadialGauge({ value, size = 64, stroke = 6, tone, children, label }: { value: number; size?: number; stroke?: number; tone?: "accent" | "warn" | "loss" | "profit"; children?: ReactNode; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="dkit-gauge" data-tone={tone ?? (clamped >= 90 ? "loss" : clamped >= 70 ? "warn" : "accent")} style={{ width: size, height: size }} role="meter" aria-label={label} aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} className="dkit-turn">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="dkit-ring" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="dkit-gauge-arc" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (clamped / 100) * c} style={vars({ "--dkit-c": c })} />
      </svg>
      {children ? <div className="dkit-gauge-center">{children}</div> : null}
    </div>
  );
}

/** A tiny line with a soft fill, drawn left to right; flat input draws a flat line, one point draws nothing. */
/** `stretch` (R4-11): the line fills a box its CSS sizes (a page-wide chart), its stroke kept unscaled. */
export function Sparkline({ values, width = 96, height = 28, tone, className, stretch = false }: { values: readonly number[]; width?: number; height?: number; tone?: "up" | "down" | "flat"; className?: string; stretch?: boolean }) {
  if (values.length < 2) return <span className={cn("dkit-spark dkit-spark-empty", className)} style={{ width, height }} aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const t = tone ?? (last > first ? "up" : last < first ? "down" : "flat");
  return (
    <svg className={cn("dkit-spark", className)} data-tone={t} data-stretch={stretch ? "" : undefined} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={stretch ? "none" : undefined} aria-hidden>
      <path d={area} className="dkit-spark-area" />
      <path d={line} className="dkit-spark-line" pathLength={1} />
    </svg>
  );
}

/** Overlapping asset marks with a "+N" cell; the names are for the screen reader and the hover. */
export function LogoStack({ symbols, max = 4, size = "md", names }: { symbols: readonly string[]; max?: number; size?: "sm" | "md" | "lg"; names?: readonly string[] }) {
  const shown = symbols.slice(0, max);
  const more = symbols.length - shown.length;
  return (
    <span className="dkit-logos" data-size={size} role="img" aria-label={(names ?? symbols).join(", ")}>
      {shown.map((s, i) => (
        <span key={s} className="dkit-logo" style={{ zIndex: shown.length - i }} title={names?.[i] ?? s}>
          <AssetDisc asset={s} className="dkit-logo-disc" />
        </span>
      ))}
      {more > 0 ? <span className="dkit-logo dkit-logo-more">+{more}</span> : null}
    </span>
  );
}
