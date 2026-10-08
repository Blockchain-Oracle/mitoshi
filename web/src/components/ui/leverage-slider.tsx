"use client";
// From 21st.dev 29217 ai2/slider-marks ("snap stops with labeled ticks") — revamped per D-044 into the Boost multiple
// (E.1 "leverage slider from 29217"): kept the idea (a track, a fill, labelled snap stops the value can only rest on,
// arrows/Home/End), but on Base UI's `Slider` (the design system's primitive; the source's hand-rolled pointer
// capture and a11y dropped), a 44 px hit area on the 20 px thumb (the source's 14–24 px failed §2.5), each stop
// labelled "1×", "2×", "3×" and clickable, `aria-valuetext` "2× boost", tokens only, no motion runtime.
import { Slider } from "@base-ui/react/slider";
import { cn } from "@/lib/utils";

export interface LeverageSliderProps {
  value: number;
  onChange: (multiple: number) => void;
  max: number;
  label: string;
  valueText: (multiple: number) => string;
  /** A stop the reserve would refuse now (e.g. 3× above ~71¢, D-116): shown struck through with its reason. */
  refused?: Readonly<Record<number, string>>;
  className?: string;
}

export function LeverageSlider({ value, onChange, max, label, valueText, refused = {}, className }: LeverageSliderProps) {
  const stops = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div className={cn("lev-slider", className)}>
      <Slider.Root value={value} min={1} max={max} step={1} onValueChange={(v) => onChange(v as number)} className="lev-root" aria-label={label}>
        <Slider.Control className="lev-control">
          <Slider.Track className="lev-track">
            <Slider.Indicator className="lev-fill" />
            <Slider.Thumb className="lev-thumb" getAriaLabel={() => label} getAriaValueText={(_f, v) => valueText(v)} />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <div className="lev-stops" role="group" aria-label={label}>
        {stops.map((m) => (
          <button key={m} type="button" className={cn("lev-stop min-h-touch", m === value && "is-on", refused[m] && "is-refused")} aria-pressed={m === value} title={refused[m]} onClick={() => onChange(m)} aria-label={refused[m] ? `${valueText(m)} — ${refused[m]}` : valueText(m)}>
            {m}×
          </button>
        ))}
      </div>
    </div>
  );
}
