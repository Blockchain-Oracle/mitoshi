"use client";
// Ported from Owarine 90a91d71:web/src/features/desk/cockpit/{OverviewTab,LimitGauges}.tsx (R4-6, D-227) — the latest
// decision as its card (it opens the Decisions tab), the strategy's on-chain limits as figures, and — when this wallet
// copies it — its own copy's gauges off the live vault grant: spent today against the daily cap, open against the most.
import { RadialGauge } from "@/components/kit/desk-kit";
import { spentTodayOf } from "../strategies/activity";
import { centsOf, usdCap, usd } from "../strategies/format";
import type { StrategyDetailPayload } from "../strategies/protocol";
import type { CopyWrites } from "../strategies/useCopyWrites";
import { AGENTS } from "./copy";
import { DecisionCard } from "./DecisionTimeline";

const C = AGENTS.cockpit;
const share = (part: bigint, whole: bigint) => (whole <= 0n ? 0 : Number((part * 10_000n) / whole) / 100);

export function OverviewTab({ detail, writes, onOpenDecisions }: { detail: StrategyDetailPayload; writes: CopyWrites; onOpenDecisions: () => void }) {
  const s = detail.strategy;
  const e = s.envelope;
  const latest = detail.decisions[0] ?? null;
  const sub = writes.mine.find((m) => m.strategyId === s.strategyId && m.active) ?? null;
  const grant = sub && writes.grant && writes.grant.grantId.toString() === sub.grantId && !writes.grant.revoked ? writes.grant : null;
  const nowSec = Math.floor(Date.now() / 1000);
  const spent = grant ? spentTodayOf(grant, nowSec) : 0n;
  return (
    <div className="cp-overview">
      <div className="cp-col">
        {latest && (
          <section className="cp-card" aria-label={C.latest}>
            <span className="cp-stat-label">{C.latest}</span>
            <DecisionCard d={latest} nowMs={Date.now()} onOpen={onOpenDecisions} />
          </section>
        )}
        <section className="cp-card" aria-label={C.limits}>
          <span className="cp-stat-label">{C.limits}</span>
          <div className="cp-figures">
            <div className="cp-figure"><span className="cp-stat-label">Per trade</span><b>{usdCap(BigInt(e.maxStakePerTradeBase))}</b></div>
            <div className="cp-figure"><span className="cp-stat-label">Per day</span><b>{usdCap(BigInt(e.maxDailySpendBase))}</b></div>
            <div className="cp-figure"><span className="cp-stat-label">Open</span><b>{e.maxOpenPositions}</b></div>
            <div className="cp-figure"><span className="cp-stat-label">Price cap</span><b>{BigInt(e.maxPriceRaw) > 0n ? centsOf(BigInt(e.maxPriceRaw)) : "—"}</b></div>
          </div>
        </section>
      </div>
      {grant && (
        <div className="cp-col">
          <section className="cp-card" aria-label={C.yours}>
            <span className="cp-stat-label">{C.yours}</span>
            <div className="cp-gauges">
              <Gauge label="Spent today" value={share(spent, grant.caps.maxDailySpendBase)} center={`${Math.round(share(spent, grant.caps.maxDailySpendBase))}%`} line={`${usd(spent)} / ${usd(grant.caps.maxDailySpendBase)}`} />
              <Gauge label="Open" value={grant.caps.maxOpenPositions > 0 ? (grant.openPositions / grant.caps.maxOpenPositions) * 100 : 0} center={`${grant.openPositions}/${grant.caps.maxOpenPositions}`} line={`${usd(grant.caps.maxStakePerTradeBase)} / trade`} />
            </div>
            <div className="cp-figures">
              <div className="cp-figure"><span className="cp-stat-label">Budget left</span><b>{usd(grant.budgetBase)}</b></div>
              <div className="cp-figure"><span className="cp-stat-label">Resets</span><b>00:00 UTC</b></div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Gauge({ label, value, center, line }: { label: string; value: number; center: string; line: string }) {
  return (
    <div className="cp-gauge">
      <RadialGauge value={value} size={72} stroke={7} label={`${label}: ${line}`}>{center}</RadialGauge>
      <div className="cp-gauge-text">
        <span className="cp-stat-label">{label}</span>
        <span className="type-caption text-ink-secondary">{line}</span>
      </div>
    </div>
  );
}
