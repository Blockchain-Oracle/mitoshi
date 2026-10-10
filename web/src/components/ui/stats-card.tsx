// From 21st.dev 7870 ravikatiyar162/stats-card (Freelancer Stats Card), revamped per D-044 for `/stats` (S5): the
// header with its time-frame pill, the one big figure with its change line, the two sub-stats, the highlighted band
// and the bar strip are the source's; earnings → any headline, ranking → a highlighted figure, availability → a strip
// of real counts (each bar's height is its count over the strip's highest, a zero is an empty track). framer-motion
// and the rainbow gradient are gone (a site route carries no motion runtime, §3.1): bars grow once in CSS, not under
// reduced motion, in the accent. The strip is one `role="img"` whose label lists every bar's value.
import type { ReactNode } from "react";

export interface StatsCardProps {
  title: string;
  timeFrame: string;
  headline: { value: string; caption?: ReactNode };
  subStats: readonly [SubStat, SubStat];
  band: { value: string; label: string; sub: string };
  bars: { title: string; counts: readonly number[]; label: string; aria: string };
  className?: string;
}

interface SubStat {
  value: string;
  label: string;
  sub: string;
}

export function StatsCard({ title, timeFrame, headline, subStats, band, bars, className }: StatsCardProps) {
  const max = Math.max(1, ...bars.counts);
  return (
    <section aria-labelledby="stats-card-title" className={`flex w-full flex-col gap-6 rounded-lg border border-hairline bg-surface-1 p-6 ${className ?? ""}`}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="stats-card-title" className="type-body-strong text-ink">{title}</h2>
        <span className="rounded-full bg-surface-2 px-3 py-1 type-caption text-ink-secondary">{timeFrame}</span>
      </header>

      <div className="flex flex-col gap-2">
        <p className="type-display text-ink tabular-nums">{headline.value}</p>
        {headline.caption ? <p className="type-caption text-up">{headline.caption}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {subStats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 rounded-md bg-surface-2 p-4">
            <p className="type-title text-ink tabular-nums">
              {s.value} <span className="type-body text-ink-secondary">{s.label}</span>
            </p>
            <p className="type-caption text-ink-secondary">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1 rounded-md border border-accent/30 bg-accent/10 p-4">
        <p className="type-title text-ink tabular-nums">
          {band.value} <span className="type-body text-ink-secondary">{band.label}</span>
        </p>
        <p className="type-caption text-ink-secondary">{band.sub}</p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="type-label-micro text-ink-secondary">{bars.title}</h3>
        <div role="img" aria-label={bars.aria} className="flex h-14 items-end gap-1">
          {bars.counts.map((n, i) => (
            <span key={i} aria-hidden className="flex h-full flex-1 items-end rounded-sm bg-surface-2">
              {n > 0 ? <span className="stats-bar w-full rounded-sm bg-accent-fill" style={{ height: `${Math.max(6, (n / max) * 100)}%`, animationDelay: `${i * 30}ms` }} /> : null}
            </span>
          ))}
        </div>
        <p className="type-caption text-ink-secondary">{bars.label}</p>
      </div>
    </section>
  );
}
