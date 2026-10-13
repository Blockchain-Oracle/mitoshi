"use client";
// §04's curve — Ported from Owarine 90a91d71:web/src/features/surface/TermChart.tsx (R4-11, D-227): each live Window's UP
// price (mid where both sides rest) on a categorical x-axis, one slot per Window by close; every point is a button that
// makes its Window the focal one.
import { bpsToOddsCents, termBand, type MarketId, type TermPoint } from "@cwf/core";
import { formatClock } from "@cwf/core/units";
import { cn } from "@/lib/utils";
import { SURFACE } from "./copy";

const W = 1000;
const H = 100;
const GRID_ROWS = 3;

export function TermChart({ points, focalId, onPick }: { points: readonly TermPoint[]; focalId: MarketId | null; onPick: (id: MarketId) => void }) {
  const T = SURFACE.term;
  const band = termBand(points);
  const priced = points.filter((p) => p.implied !== null);
  if (points.length < 2 || !band) {
    return <div className="sf-box sf-box--chart"><div className="sf-box-empty">{points.length < 2 ? T.oneWindow : priced.length === 0 && points.some((p) => p.structure === null) ? SURFACE.reading : T.unpriced}</div></div>;
  }
  const slot = (i: number) => ((i + 0.5) / points.length) * 100;
  const yPct = (bps: number) => (1 - (bps - band.minBps) / Math.max(1, band.maxBps - band.minBps)) * 100;
  const line = points.map((p, i) => (p.implied ? `${((slot(i) / 100) * W).toFixed(1)},${((yPct(p.implied.bps) / 100) * H).toFixed(1)}` : null)).filter((v): v is string => v !== null).join(" ");
  const grid = Array.from({ length: GRID_ROWS + 1 }, (_, i) => band.maxBps - (i / GRID_ROWS) * (band.maxBps - band.minBps));
  return (
    <div className="sf-box sf-box--chart sf-term">
      <div className="sf-term-y" aria-hidden>{grid.map((bps) => <span key={bps}>{bpsToOddsCents(bps)}¢</span>)}</div>
      <div className="sf-term-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden focusable="false">
          {grid.map((bps) => <line key={bps} className="sf-term-grid" x1={0} x2={W} y1={(yPct(bps) / 100) * H} y2={(yPct(bps) / 100) * H} />)}
          {priced.length >= 2 ? <polyline className="sf-term-line" points={line} /> : null}
        </svg>
        {points.map((p, i) =>
          p.implied ? (
            <button key={p.marketId} type="button" className={cn("sf-term-dot", p.marketId === focalId && "sf-term-dot--focal")} style={{ left: `${slot(i)}%`, top: `${yPct(p.implied.bps)}%` }} aria-label={T.pick(p.cadence)} aria-pressed={p.marketId === focalId} title={T.point(p.cadence, `${bpsToOddsCents(p.implied.bps)}¢`)} onClick={() => onPick(p.marketId)} />
          ) : (
            <span key={p.marketId} className="sf-term-gap" style={{ left: `${slot(i)}%` }} title={p.unavailable ? T.unavailable : SURFACE.reading}>{p.structure === null ? "…" : "—"}</span>
          ),
        )}
      </div>
      <div className="sf-term-x" aria-hidden>
        {points.map((p) => (
          <span key={p.marketId} className={cn(p.marketId === focalId && "sf-term-x--focal")}>
            <b>{p.cadence}</b>
            <i>{p.remainingSec > 0 ? formatClock(p.remainingSec) : "—"}</i>
          </span>
        ))}
      </div>
    </div>
  );
}
