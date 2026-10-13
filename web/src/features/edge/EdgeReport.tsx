"use client";
// Ported from Masayume 68f7a09:web/src/features/edge/{EdgeReport,EdgeMetrics,EdgeWindows,EdgePayoff}.tsx — the report:
// the net result with its curve and readout, four metrics, the time-of-day split bars and the payoff shape. The
// reference's own SVG curve gives way to 21st 29532 (`components/ui/portfolio-chart`, the curve `/portfolio` already
// draws from the same rounds, so the two can't disagree); the `edge-*` palette gives way to Mitoshi's tokens. R4-4
// (D-227): the chart runs headless (the net figure is said once), the time-of-day rows hold their bar at 320 px, the
// metrics sit two-up on a phone, the source and method sit in the provenance box, and the reputation, badges and CSV
// moved to /portfolio's record. Every figure is the account's own: privacy mode (the balance eye) masks them all, the
// chart's axis and table included (critic gap 15).
import type { TraderEdge, WalletHistory } from "@cwf/core";
import Link from "next/link";
import { PortfolioChart } from "@/components/ui/portfolio-chart";
import { RECORD_CHART } from "@/features/markets/copy";
import { recordPoints } from "./record-points";
import { money as moneyText, moneyTone } from "@/features/terminal/format";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { EDGE } from "./copy";

type Tone = "gain" | "loss" | "flat";
/** The tone of a figure as it reads at two decimals: a P&L that rounds to zero cents is flat, never a red −$0.00. */
const toneOf = (v: bigint, decimals = 6): Tone => ({ "is-up": "gain", "is-down": "loss", "": "flat" } as const)[moneyTone(v, decimals)];
const INK: Record<Tone, string> = { gain: "text-up", loss: "text-down", flat: "text-ink" };
const MIN_BAR_PCT = 4;

/** `+$1.20` / `−$0.40` / `$0.00`, rounded to the cent as the terminal and the record's curve round (`terminal/format`). */
const moneyOf = (v: bigint, decimals: number, signed = true): string => moneyText(signed ? v : v < 0n ? -v : v, signed, decimals);
type Fmt = typeof moneyOf;
/** The report is the account's own money: with privacy mode on (the balance eye) every figure is the dots. */
function useMoneyFmt(): Fmt {
  return usePrivacy() ? () => SHELL.masked : moneyOf;
}
const pct = (v: number) => (Math.abs(v) < 0.05 ? "0.0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`);

function readout(report: TraderEdge, decimals: number, money: Fmt): string {
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
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-hairline bg-surface-1 p-4 sm:p-5">
      <span className="type-label-micro text-ink-secondary">{label}</span>
      <span className={`type-title tabular-nums ${INK[tone]}`}>{value}</span>
      <span className="type-caption text-ink-secondary edge-xs-hide">{note}</span>
    </div>
  );
}

function Windows({ report, decimals }: { report: TraderEdge; decimals: number }) {
  const money = useMoneyFmt();
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
            // As the figure reads at two decimals: a window that rounds to $0.00 is neither green nor red.
            const t = toneOf(x.netBase, decimals);
            const positive = t !== "loss";
            const abs = x.netBase < 0n ? -x.netBase : x.netBase;
            const width = x.count === 0 ? 0 : Math.max(MIN_BAR_PCT, Number((abs * 100n) / maxAbs));
            const label = w.labels[x.key];
            return (
              <li key={x.key} className="grid grid-cols-[4.75rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="type-body text-ink">{label.label}</span>
                  <span className="font-mono type-caption text-ink-secondary edge-xs-hide">{label.range}</span>
                </span>
                <span aria-hidden className="grid h-2.5 grid-cols-[1fr_1px_1fr] items-center">
                  <span className="flex h-full justify-end">{t === "loss" && x.count > 0 ? <span className="h-full rounded-l-sm bg-down" style={{ width: `${width}%` }} /> : null}</span>
                  <span className="h-4 bg-hairline" />
                  <span className="flex h-full">{t === "gain" && x.count > 0 ? <span className="h-full rounded-r-sm bg-up" style={{ width: `${width}%` }} /> : null}</span>
                </span>
                <span className="flex min-w-16 flex-col items-end sm:min-w-24">
                  <span className={`type-body-strong tabular-nums ${x.count === 0 ? "text-ink-secondary" : INK[t]}`}>{x.count === 0 ? w.none : money(x.netBase, decimals)}</span>
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
  const money = useMoneyFmt();
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
      <div className="flex flex-col gap-2 rounded-md bg-surface-2 p-4">
        <span className="type-label-micro text-ink-secondary">{p.provenanceLabel}</span>
        <p className="type-caption text-ink-secondary">
          {p.provenance} <Link href="/docs/record" className="text-ink underline underline-offset-4">{p.proof}</Link>
        </p>
        <dl className="flex flex-col gap-1 type-caption">
          {[p.source, p.method].map((m) => (
            <div key={m.label} className="flex flex-wrap gap-x-2">
              <dt className="text-ink-secondary">{m.label}</dt>
              <dd className="text-ink">{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}

export function EdgeReport({ history, report, onRetry }: { history: WalletHistory; report: TraderEdge; onRetry: () => void }) {
  const { decimals } = history;
  const money = useMoneyFmt();
  const hidden = usePrivacy();
  const tone = toneOf(report.netBase, decimals);
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
          <PortfolioChart points={recordPoints(history)} status="ready" labels={RECORD_CHART} onRetry={onRetry} headless mask={hidden ? SHELL.masked : undefined} />
        </section>
        <aside className="flex flex-col justify-between gap-4 rounded-lg border border-accent/30 bg-accent/10 p-5" aria-labelledby="edge-readout">
          <div className="flex flex-col gap-2">
            <span id="edge-readout" className="type-label-micro text-ink-secondary">{EDGE.report.readoutLabel}</span>
            <p className="type-title text-ink">{readout(report, decimals, money)}</p>
          </div>
          <p className="type-caption text-ink-secondary">{EDGE.report.readoutFoot}</p>
        </aside>
      </div>

      <section aria-label={m.label} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label={m.winRate.label} value={report.winRatePct === null ? m.winRate.unset : `${report.winRatePct.toFixed(0)}%`} note={m.winRate.note(report.wins, report.losses)} />
        <Metric label={m.profitFactor.label} value={report.profitFactor === null ? m.profitFactor.noLoss : report.profitFactor.toFixed(2)} note={m.profitFactor.note} />
        <Metric label={m.expectancy.label} value={report.expectancyBase === null ? m.expectancy.unset : money(report.expectancyBase, decimals)} note={m.expectancy.note} tone={report.expectancyBase === null ? "flat" : toneOf(report.expectancyBase, decimals)} />
        <Metric label={m.drawdown.label} value={money(report.maxDrawdownBase, decimals, false)} note={m.drawdown.note} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Windows report={report} decimals={decimals} />
        <Payoff report={report} decimals={decimals} />
      </div>
    </div>
  );
}
