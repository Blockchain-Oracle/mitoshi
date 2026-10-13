"use client";
// From 21st.dev 31347 wensity/slider (the dual-thumb range slider) over 21st.dev 32784 nikolas-sapa/chart-bar-halftone
// (the halftone bars) — revamped per D-044 into the Range band selector (E.1 "31347 slider over 32784 distribution
// bars"). 31347 kept: Base UI `Slider.Root` with a value array (one thumb per edge), `minStepsBetweenValues`, the value
// bubble shown only while dragging or keyboard-focused, the thumb's press ring; changed: its injected <style> tag →
// `styles/range.css`, `--primitive-*` → Masayume tokens, a 44 px thumb hit area around the 24 px thumb, each thumb
// labelled ("Band low", "Band high") with a dollar `aria-valuetext`. 32784 kept: bars whose ink density (a 4×4 Bayer
// halftone) repeats their height, an SVG with `role="img"` and a screen-reader table; changed: the bars are the model's
// probability of the close landing in each price bucket (the host computes them from the chain's basis), bars inside
// the band ink in the accent and the rest in muted ink, no tip labels (the band's odds are on the ticket), tokens only.
import { Slider } from "@base-ui/react/slider";
import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

export interface BandBar {
  /** The bucket's centre on the slider's axis. */
  at: number;
  /** Relative weight, any unit (normalised to the tallest bar). */
  weight: number;
  label: string;
}

export interface BandSliderProps {
  min: number;
  max: number;
  step: number;
  value: readonly [number, number];
  onChange: (next: [number, number]) => void;
  /** Least distance between the two edges, in steps. */
  minSteps?: number;
  bars: readonly BandBar[];
  format: (v: number) => string;
  label: string;
  lowLabel: string;
  highLabel: string;
  /** The live price, marked on the axis. */
  marker?: number | null;
  markerLabel?: string;
  className?: string;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const LEVELS = 16;
const VIEW_W = 1000;
const VIEW_H = 120;

function Pattern({ id, level, tone }: { id: string; level: number; tone: "in" | "out" }) {
  const cells = [];
  for (let i = 0; i < 16; i++) if (BAYER[i]! < level) cells.push(<rect key={i} x={(i % 4) * 2} y={Math.floor(i / 4) * 2} width={2} height={2} />);
  return (
    <pattern id={id} width={8} height={8} patternUnits="userSpaceOnUse">
      <g className={tone === "in" ? "band-ink-in" : "band-ink-out"}>{cells}</g>
    </pattern>
  );
}

export function BandSlider({ min, max, step, value, onChange, minSteps = 1, bars, format, label, lowLabel, highLabel, marker = null, markerLabel, className }: BandSliderProps) {
  const uid = useId().replace(/:/g, "");
  const top = useMemo(() => Math.max(1e-12, ...bars.map((b) => b.weight)), [bars]);
  const span = Math.max(1e-12, max - min);
  const x = (v: number) => ((v - min) / span) * VIEW_W;
  const barW = bars.length > 1 ? (VIEW_W / bars.length) * 0.7 : 20;
  return (
    <div className={cn("band-slider", className)} data-base-ui-swipe-ignore="">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="band-bars" role="img" aria-label={label}>
        <defs>
          {Array.from({ length: LEVELS + 1 }, (_, level) => (
            <g key={level}>
              <Pattern id={`${uid}-in-${level}`} level={level} tone="in" />
              <Pattern id={`${uid}-out-${level}`} level={level} tone="out" />
            </g>
          ))}
        </defs>
        {bars.map((b) => {
          const h = Math.max(2, (b.weight / top) * (VIEW_H - 4));
          const level = Math.max(1, Math.round((b.weight / top) * LEVELS));
          const inside = b.at >= value[0] && b.at <= value[1];
          return <rect key={b.label} x={x(b.at) - barW / 2} y={VIEW_H - h} width={barW} height={h} fill={`url(#${uid}-${inside ? "in" : "out"}-${level})`} className={inside ? "band-bar-in" : "band-bar-out"} />;
        })}
        {marker !== null ? <line x1={x(marker)} x2={x(marker)} y1={0} y2={VIEW_H} className="band-marker" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {bars.map((b) => (
            <tr key={b.label}>
              <th scope="row">{b.label}</th>
              <td>{Math.round((b.weight / top) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Slider.Root
        value={[value[0], value[1]]}
        min={min}
        max={max}
        step={step}
        minStepsBetweenValues={minSteps}
        onValueChange={(next) => {
          const [lo, hi] = next as number[];
          if (lo !== undefined && hi !== undefined) onChange([lo, hi]);
        }}
        className="band-root"
      >
        <Slider.Control className="band-control">
          <Slider.Track className="band-track">
            <Slider.Indicator className="band-indicator" />
            {[0, 1].map((index) => (
              <Slider.Thumb key={index} index={index} className="band-thumb" getAriaLabel={() => (index === 0 ? lowLabel : highLabel)} getAriaValueText={(_f, v) => format(v)}>
                <span className="band-bubble numbers" aria-hidden>
                  {format(value[index as 0 | 1])}
                </span>
              </Slider.Thumb>
            ))}
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <div className="band-axis numbers" aria-hidden>
        <span>{format(min)}</span>
        {marker !== null && markerLabel ? <span className="band-axis-marker">{markerLabel}</span> : null}
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
