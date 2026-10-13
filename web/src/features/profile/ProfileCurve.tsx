"use client";
// A trader's realised P&L over time (R6 money, S20; D-230) — From 21st.dev 6835 user_xn1cklas/public-stats (a stats
// card: a title row over a series chart), drawn by the installed 29532 arihantcodes/portfolio-chart with its range
// selector (7D · 30D · All), the readout on scrub and the screen-reader table: the running sum of realised P&L by
// settled round from the index (`data.ts` `pnlCurve`). It's a public record, so the balance eye doesn't mask it. No
// round yet: why and the next step; one round: its point and a line saying so.
import { EmptyState } from "@/components/states/EmptyState";
import { PortfolioChart } from "@/components/ui/portfolio-chart";
import { PROFILE as P } from "./copy";

const DECIMALS = 6;

export function ProfileCurve({ curve }: { curve: readonly { atSec: number; cumPnlBase: string }[] }) {
  const C = P.curve;
  if (curve.length === 0) return <EmptyState why={C.empty} nextAction={{ label: P.makeCall, href: "/trade/BTC" }} className="prf-curve-empty" />;
  const points = curve.map((p) => ({ tMs: p.atSec * 1000, value: Number(p.cumPnlBase) / 10 ** DECIMALS }));
  return (
    <section className="prf-curve" aria-label={C.labels.title}>
      <span className="prf-curve-title">{C.labels.title}</span>
      <PortfolioChart points={points} status="ready" labels={C.labels} headless />
      {curve.length === 1 ? <p className="prf-quiet">{C.one}</p> : null}
    </section>
  );
}
