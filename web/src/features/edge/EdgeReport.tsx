"use client";
// Ported from Masayume 68f7a09:web/src/features/edge/{EdgeReport,EdgeMetrics,EdgeWindows,EdgePayoff}.tsx — the report:
// the net result with its curve and readout, four metrics, the time-of-day split bars and the payoff shape. The
// reference's own SVG curve gives way to 21st 29532 (`components/ui/portfolio-chart`, the curve `/portfolio` already
// draws from the same rounds, so the two can't disagree); the `edge-*` palette gives way to Mitoshi's tokens.
import { formatBaseUnits, type TraderEdge, type WalletHistory } from "@cwf/core";
import { PortfolioChart } from "@/components/ui/portfolio-chart";
import { RECORD_CHART } from "@/features/markets/copy";
import { recordPoints } from "@/features/markets/portfolio/RecordChart";
import { EDGE } from "./copy";

type Tone = "gain" | "loss" | "flat";
const toneOf = (v: bigint): Tone => (v > 0n ? "gain" : v < 0n ? "loss" : "flat");
const INK: Record<Tone, string> = { gain: "text-up", loss: "text-down", flat: "text-ink" };
const MIN_BAR_PCT = 4;

/** `+$1.20` / `−$0.40` / `$0.00` over base units, never a float. */
function money(v: bigint, decimals: number, signed = true): string {
  const text = formatBaseUnits(v < 0n ? -v : v, decimals, { maxDp: 2, minDp: 2 });
  if (!signed || v === 0n) return `$${text}`;
  return `${v > 0n ? "+" : "−"}$${text}`;
}
const pct = (v: number) => (Math.abs(v) < 0.05 ? "0.0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`);

function readout(report: TraderEdge, decimals: number): string {
  const w = EDGE.report.readout;
  const r = report.readout;
  switch (r.kind) {
    case "more-rounds":
      return w.moreRounds(r.needed);
    case "best-window":
      return w.bestWindow(EDGE.report.windows.labels[r.window.key].label, money(r.window.netBase, decimals), r.window.count);
    case "profit-factor":
      return w.profitFactor(r.factor.toFixed(2));
    case "drawdown":
      return w.drawdown(money(r.drawdownBase, decimals, false));
    case "flat":
      return w.flat;
  }
}

function Metric({ label, value, note, tone = "flat" }: { label: string; value: string; note: string; tone?: Tone }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-1 p-5">
      <span className="type-label-micro text-ink-secondary">{label}</span>
      <span className={`type-title tabular-nums ${INK[tone]}`}>{value}</span>
      <span className="type-caption text-ink-secondary">{note}</span>
    </div>
  );
}

function Windows({ report, decimals }: { report: TraderEdge; decimals: number }) {
  const w = EDGE.report.windows;
  const timed = report.windows.reduce((s, x) => s + x.count, 0);
  const maxAbs = report.windows.reduce((m, x) => {
    const a = x.netBase < 0n ? -x.netBase : x.netBase;
    return a > m ? a : m;
  }, 1n);
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface-1 p-5" aria-labelledby="edge-windows">
      <div className="flex flex-col gap-1">
        <h2 id="edge-windows" className="type-body-strong text-ink">{w.title}</h2>
        <p className="type-caption text-ink-secondary">{w.copy}</p>
      </div>
      {timed === 0 ? (
        <p className="type-body text-ink-secondary">{w.unreadable}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {report.windows.map((x) => {
            const positive = x.netBase >= 0n;
            const abs = x.netBase < 0n ? -x.netBase : x.netBase;
            const width = x.count === 0 ? 0 : Math.max(MIN_BAR_PCT, Number((abs * 100n) / maxAbs));
            const label = w.labels[x.key];
            return (
              <li key={x.key} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3">
                <span className="flex flex-col">
                  <span className="type-body text-ink">{label.label}</span>
                  <span className="font-mono type-caption text-ink-secondary">{label.range}</span>
                </span>
                <span aria-hidden className="grid h-2.5 grid-cols-[1fr_1px_1fr] items-center">
                  <span className="flex h-full justify-end">{!positive && x.count > 0 ? <span className="h-full rounded-l-sm bg-down" style={{ width: `${width}%` }} /> : null}</span>
                  <span className="h-4 bg-hairline" />
                  <span className="flex h-full">{positive && x.count > 0 ? <span className="h-full rounded-r-sm bg-up" style={{ width: `${width}%` }} /> : null}</span>
                </span>
                <span className="flex min-w-24 flex-col items-end">
                  <span className={`type-body-strong tabular-nums ${x.count === 0 ? "text-ink-secondary" : positive ? "text-up" : "text-down"}`}>{x.count === 0 ? w.none : money(x.netBase, decimals)}</span>
                  <span className="type-caption text-ink-secondary">{w.rounds(x.count)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Payoff({ report, decimals }: { report: TraderEdge; decimals: number }) {
  const p = EDGE.report.payoff;
  const rows: [string, string][] = [
    [p.averageWin, report.averageWinBase === null ? p.noWins : money(report.averageWinBase, decimals)],
    [p.averageLoss, report.averageLossBase === null ? p.noLosses : money(-report.averageLossBase, decimals)],
    [p.bestRun, p.runs(report.bestWinStreak)],
    [p.fees, money(report.settlementFeesBase, decimals, false)],
    [p.stake, money(report.stakeBase, decimals, false)],
  ];
  return (
    <aside className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface-1 p-5" aria-labelledby="edge-payoff">
      <h2 id="edge-payoff" className="type-body-strong text-ink">{p.title}</h2>
      <dl className="flex flex-col divide-y divide-hairline">
        {rows.map(([name, value]) => (
          <div key={name} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="type-body text-ink-secondary">{name}</dt>
            <dd className="type-body-strong text-ink tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1 rounded-md bg-surface-2 p-4">
        <span className="type-label-micro text-ink-secondary">{p.provenanceLabel}</span>
        <p className="type-caption text-ink-secondary">{p.provenance}</p>
      </div>
    </aside>
  );
}

export function EdgeReport({ history, report, onRetry }: { history: WalletHistory; report: TraderEdge; onRetry: () => void }) {
  const { decimals } = history;
  const tone = toneOf(report.netBase);
  const m = EDGE.report.metrics;
  return (
    <div className="flex flex-col gap-6">
      {!history.complete ? <p className="rounded-md border border-hairline bg-surface-1 p-3 type-caption text-ink-secondary">{EDGE.states.partial}</p> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface-1 p-5" aria-labelledby="edge-net">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span id="edge-net" className="type-label-micro text-ink-secondary">{EDGE.report.netLabel}</span>
              <span className={`type-display tabular-nums ${INK[tone]}`}>{money(report.netBase, decimals)}</span>
              <span className="type-caption text-ink-secondary">{report.roiPct === null ? EDGE.report.roiUnavailable : EDGE.report.roi(pct(report.roiPct))}</span>
            </div>
            <span className="type-caption text-ink-secondary tabular-nums">{EDGE.report.sample(report.settledRounds, report.openRounds)}</span>
          </div>
          <PortfolioChart points={recordPoints(history)} status="ready" labels={RECORD_CHART} onRetry={onRetry} />
        </section>
        <aside className="flex flex-col justify-between gap-4 rounded-lg border border-accent/30 bg-accent/10 p-5" aria-labelledby="edge-readout">
          <div className="flex flex-col gap-2">
            <span id="edge-readout" className="type-label-micro text-ink-secondary">{EDGE.report.readoutLabel}</span>
            <p className="type-title text-ink">{readout(report, decimals)}</p>
          </div>
          <p className="type-caption text-ink-secondary">{EDGE.report.readoutFoot}</p>
        </aside>
      </div>

      <section aria-label={m.label} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={m.winRate.label} value={report.winRatePct === null ? m.winRate.unset : `${report.winRatePct.toFixed(0)}%`} note={m.winRate.note(report.wins, report.losses)} />
        <Metric label={m.profitFactor.label} value={report.profitFactor === null ? m.profitFactor.noLoss : report.profitFactor.toFixed(2)} note={m.profitFactor.note} />
        <Metric label={m.expectancy.label} value={report.expectancyBase === null ? m.expectancy.unset : money(report.expectancyBase, decimals)} note={m.expectancy.note} tone={report.expectancyBase === null ? "flat" : toneOf(report.expectancyBase)} />
        <Metric label={m.drawdown.label} value={money(report.maxDrawdownBase, decimals, false)} note={m.drawdown.note} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Windows report={report} decimals={decimals} />
        <Payoff report={report} decimals={decimals} />
      </div>
      <p className="type-caption text-ink-secondary">{EDGE.report.footer}</p>
    </div>
  );
}
