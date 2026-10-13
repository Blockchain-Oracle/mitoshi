// From 21st.dev 26545 8starlabs/partition-bar — revamped per D-044 (R4-12, D-227): one track of proportional segments
// on Mitoshi tones (vermilion on Tempo, amber in flight, grey held, hairline surplus) instead of the demo's shadcn
// variants; values are pre-computed ratios from integer base units (never floats of money), the figures under each
// segment come formatted from the host, a zero segment draws nothing, and an empty track says so to screen readers.
import { cn } from "@/lib/utils";

export type PartitionTone = "accent" | "warning" | "muted" | "surplus";

export interface PartitionSegment {
  id: string;
  /** Any non-negative weight; only the proportion is drawn. */
  weight: number;
  tone: PartitionTone;
  label: string;
  /** The formatted figure for the legend, e.g. "20". */
  display: string;
}

export function PartitionBar({ segments, label, legend = true, className }: { segments: readonly PartitionSegment[]; label: string; legend?: boolean; className?: string }) {
  const drawn = segments.filter((s) => s.weight > 0);
  const summary = segments.map((s) => `${s.label} ${s.display}`).join(", ");
  return (
    <div className={cn("pbar", className)}>
      <div className="pbar-track" role="img" aria-label={`${label}: ${summary}`}>
        {drawn.length === 0 ? <span className="pbar-empty" /> : drawn.map((s) => <span key={s.id} className="pbar-seg" data-tone={s.tone} style={{ flexGrow: s.weight }} />)}
      </div>
      {legend ? (
        <ul className="pbar-legend" aria-hidden>
          {segments.map((s) => (
            <li key={s.id} className="pbar-key">
              <span className="pbar-dot" data-tone={s.tone} />
              <span>{s.label}</span>
              <span className="numbers pbar-num">{s.display}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
