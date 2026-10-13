// From 21st.dev 26906 openstatusHQ/status-bar — revamped per D-044 (R4-12, D-227): one cell per day over a fixed
// window, toned by that day's worst verdict (vermilion backed, amber partial, loss short, hairline no record), each cell
// focusable with its own label; the original's hover/pin card machinery is replaced by the native title and a
// one-line legend, which is what a 30-cell reserves history needs. Styles in `styles/bridge-kit.css`.
import { cn } from "@/lib/utils";

export type StatusDayTone = "ok" | "warn" | "bad" | "none";

export interface StatusDay {
  day: string;
  tone: StatusDayTone;
  /** e.g. "2026-10-12 · Partial · 288 checks". */
  label: string;
}

export function StatusBar({ days, label, startText, endText, className }: { days: readonly StatusDay[]; label: string; startText: string; endText: string; className?: string }) {
  return (
    <div className={cn("sbar", className)}>
      <ol className="sbar-cells" aria-label={label}>
        {days.map((d) => (
          <li key={d.day} className="sbar-cell" data-tone={d.tone} title={d.label} tabIndex={0} aria-label={d.label} />
        ))}
      </ol>
      <div className="sbar-axis" aria-hidden>
        <span>{startText}</span>
        <span>{endText}</span>
      </div>
    </div>
  );
}
