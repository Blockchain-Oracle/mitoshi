"use client";
// The Account drawer's balance card line and curve (RV-81; Tradash F §7 "Balance card", re-implemented — Tradash ships
// no licence): "Today's P&L" / "7D P&L" / "30D P&L" / "All-time P&L" with ±$X (±Y%), where X is the range's realised
// P&L plus what is open now and Y is X over what the range staked plus what is open; the line opens a smoothed
// cumulative area chart of 64 samples with the range chips 24H · 7D · 30D · All; empty, "No closed trades in this
// window". Drawn with the shared chart engine's monotone curve (21st 29532, `components/ui/chart-engine`) on the same
// `useWalletHistory` reading as the history list and /portfolio's record, so the three can't disagree. D-227: that
// reading is the account's (`useAccountHistory`: the wallet's, the Trading Balance's and the Boosts' rounds), and "open"
// is the priced positions' P&L and cost plus what sales on still-open Windows already realised.
import type { Address } from "@cwf/core";
import { useAccountHistory } from "@cwf/markets/react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { monotonePath } from "@/components/ui/chart-engine";
import { SHELL } from "@/lib/copy";
import { tapFeedback } from "@/lib/feedback";
import { useNowMs } from "@/lib/clock";
import { usePrivacy } from "@/lib/privacy";
import { TERMINAL } from "../copy";
import { money } from "../format";
import { PNL_RANGES, pnlInRange, rangeRoiBps, type PnlRange } from "../pnl-range";
import type { PositionsTotals } from "../positions-totals";

const W = 300;
const H = 88;
const PAD = 6;

function Curve({ curve }: { curve: bigint[] }) {
  const values = curve.map((v) => Number(v));
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo || 1)) * (H - 2 * PAD);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const line = monotonePath(values.map((v, i) => ({ x: x(i), y: y(v) })));
  const zero = y(0);
  const up = (values.at(-1) ?? 0) >= 0;
  return (
    <svg className={`tm-pnl-chart ${up ? "is-up" : "is-down"}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <line x1={0} x2={W} y1={zero} y2={zero} className="tm-pnl-zero" vectorEffect="non-scaling-stroke" />
      <path d={`${line}L${W},${zero}L0,${zero}Z`} className="tm-pnl-area" />
      <path d={line} className="tm-pnl-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function PnlCard({ wallet, totals }: { wallet: Address; totals: PositionsTotals }) {
  const masked = usePrivacy();
  const nowMs = useNowMs();
  const [range, setRange] = useState<PnlRange>("24H");
  const [open, setOpen] = useState(false);
  const reading = useAccountHistory(wallet);
  const rounds = reading?.ok ? reading.value.rounds : null;
  const figures = rounds && nowMs > 0 ? pnlInRange(rounds, range, nowMs) : null;
  const total = figures ? figures.realizedBase + totals.realizedBase + (totals.pnlBase ?? 0n) : null;
  // Over what the range staked, what the open Windows' sales were costed at, and what the priced positions cost.
  const roi = figures && total !== null ? rangeRoiBps(total, figures.stakedBase + totals.realizedCostBase, totals.pnlBase === null ? 0n : totals.costBase) : null;
  const label = TERMINAL.pnl.ranges[range];
  const figure = total === null ? null : masked ? SHELL.masked : `${money(total, true)}${roi === null ? "" : ` (${roi >= 0 ? "+" : "−"}${(Math.abs(roi) / 100).toFixed(2)}%)`}`;
  return (
    <div className="tm-pnl">
      <button type="button" className="tm-pnl-line-btn" aria-expanded={open} aria-controls="tm-pnl-panel" onClick={() => (tapFeedback(), setOpen((o) => !o))}>
        <span>{label}</span>
        {figure === null ? <span aria-hidden className="tm-skel" style={{ width: "5rem" }} /> : <b className={total! >= 0n ? "is-up" : "is-down"}>{figure}</b>}
        <ChevronDown aria-hidden className="tm-pnl-chevron" data-open={open ? "" : undefined} />
        <span className="sr-only">{open ? TERMINAL.pnl.hide : TERMINAL.pnl.show}</span>
      </button>
      {open ? (
        <div id="tm-pnl-panel" className="tm-pnl-panel">
          {figures === null ? <div aria-hidden className="tm-skel-row" /> : figures.count === 0 ? <p className="tm-empty">{TERMINAL.pnl.empty}</p> : <Curve curve={figures.curve} />}
          <div className="tm-tabs" role="tablist" aria-label={TERMINAL.pnl.rangeLabel}>
            {PNL_RANGES.map((r) => (
              <button key={r} type="button" role="tab" className="tm-choice" aria-selected={range === r} onClick={() => (tapFeedback(), setRange(r))}>{r}</button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
