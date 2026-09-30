"use client";

// From 21st.dev 19006 cnippet-dev/v-meter-8 (API Usage Meter Card) — revamped per D-044: the labelled meter rows over
// Base UI `Meter` (role="meter", aria-valuenow/-max from Root, a human `aria-valuetext`), Masayume surfaces and ink
// instead of the demo palette, money figures pre-formatted by the host from base units (never floats), a warn tone
// when a limit is nearly used, and no motion (the bar width is a plain CSS transition, off under reduced motion). The
// demo's hard-coded seats and plan limit are gone: the host passes real rows.
import { Meter } from "@base-ui/react/meter";
import { cn } from "@/lib/utils";

export interface UsageRow {
  id: string;
  label: string;
  /** Used amount on a 0..max scale (a ratio of base units is fine: only the proportion is drawn). */
  used: number;
  max: number;
  /** The figure shown on the right, e.g. "$7 of $25". */
  valueText: string;
  /** Extra line under the bar, e.g. "resets 00:00 UTC". */
  note?: string;
  /** Tints the bar warning when the row is nearly used (the host decides the threshold). */
  warn?: boolean;
}

export function UsageMeter({ rows, title, className }: { rows: readonly UsageRow[]; title?: string; className?: string }) {
  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {title ? <p className="type-label-micro text-ink-secondary">{title}</p> : null}
      {rows.map((row) => {
        const max = row.max > 0 ? row.max : 1;
        const used = Math.min(Math.max(row.used, 0), max);
        return (
          <Meter.Root key={row.id} value={used} max={max} aria-valuetext={`${row.label}: ${row.valueText}`} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Meter.Label className="type-caption text-ink-secondary">{row.label}</Meter.Label>
              <span className="numbers type-caption text-ink">{row.valueText}</span>
            </div>
            <Meter.Track className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <Meter.Indicator className={cn("h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none", row.warn ? "bg-warning" : "bg-accent-fill")} />
            </Meter.Track>
            {row.note ? <span className="type-caption text-ink-secondary">{row.note}</span> : null}
          </Meter.Root>
        );
      })}
    </div>
  );
}
