"use client";
// Ported from Owarine 90a91d71:web/src/features/desk/cockpit/ValueHero.tsx (R4-6, D-227) — the agent's record as the
// plate: its settled net rolling in (the kit Odometer), the win rate as a move chip, the cumulative net on Mitoshi's
// portfolio chart (21st 29532 revamped: range, drawdown, the screen-reader table), and a foot of win rate · settled ·
// open. Money is bigint to the chart's edge; dollars only there.
import { NumberTicker } from "@/components/kit/desk-kit";
import { PortfolioChart, type PortfolioChartLabels } from "@/components/ui/portfolio-chart";
import { dollars } from "../strategies/format";
import type { RecordWire } from "../strategies/protocol";
import { winRateOf } from "../strategies/record";
import { AGENTS } from "./copy";

const H = AGENTS.cockpit.hero;
const LABELS: PortfolioChartLabels = {
  title: H.title,
  range: H.rangesAria,
  ranges: [{ label: H.ranges["1d"]!, days: 1 }, { label: H.ranges["1w"]!, days: 7 }, { label: H.ranges.all!, days: 36_500 }],
  drawdown: "Drawdown",
  peak: "Peak",
  empty: H.none,
  error: "Couldn't read the record.",
  retry: "Try again",
  caption: "Cumulative settled net",
};

export function RecordHero({ record }: { record: RecordWire }) {
  const net = BigInt(record.netBase);
  const rate = winRateOf(record);
  const points = record.curve.map((p) => ({ tMs: p.atSec * 1000, value: dollars(BigInt(p.cumBase)) }));
  const tone = net > 0n ? "up" : net < 0n ? "down" : "flat";
  return (
    <section className="cp-card cp-hero" aria-label={H.title}>
      <div className="cp-hero-top">
        <div className="cp-hero-figures">
          <span className="cp-stat-label">{H.title}</span>
          <span className="cp-hero-total">
            {net < 0n ? "−" : net > 0n ? "+" : ""}$<NumberTicker value={dollars(net < 0n ? -net : net)} format="plain" />
          </span>
          {rate !== null && (
            <div className="cp-hero-moves">
              <span className="cp-move" data-tone={tone}>{rate}%<span className="cp-move-label">{H.winRate.toLowerCase()}</span></span>
            </div>
          )}
        </div>
      </div>
      {/* Headless: the plate above states the net, so the chart doesn't repeat it (R6 #9 — the cockpit read "NET" twice). */}
      <PortfolioChart points={points} status="ready" labels={LABELS} headless />
      <div className="cp-hero-foot">
        <div className="cp-stat"><span className="cp-stat-label">{H.winRate}</span><span className="cp-stat-value">{rate === null ? "—" : `${rate}%`}</span></div>
        <div className="cp-stat"><span className="cp-stat-label">{H.settled}</span><span className="cp-stat-value">{record.settled}</span></div>
        <div className="cp-stat"><span className="cp-stat-label">{H.open}</span><span className="cp-stat-value">{record.open}</span></div>
      </div>
    </section>
  );
}
