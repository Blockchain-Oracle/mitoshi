"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/LiveDesk.tsx and features/desk/cockpit/LimitGauges.tsx (R4-6,
// D-227) — Yours: the selected strategy as a desk. Its face and record; the copy's state from this wallet's own consent
// and grant beside the runner's last pass in words (`pulse`, R6 #9 — never its log line), with the top-up when the
// budget can't cover one contract at its price cap; the copier's limits as gauges read off the live vault grant
// (spent today against the daily cap, open against the most at once) with the budget left and its own result; and,
// for its creator, the copiers, the fees earned and the seal-memory form.
import { Masked } from "@/components/kit/Masked";
import { RadialGauge, StatusDot } from "@/components/kit/desk-kit";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import { pulseOf } from "../agents/pulse";
import { COPY_STATE_LABEL, copyStateOf, spentTodayOf } from "./activity";
import { AgentPortrait } from "./AgentPortrait";
import { usd, usdSigned } from "./format";
import { instinctOf, strategyIdentity } from "./identity";
import { SealMemory } from "./MemorySection";
import { ago } from "./names";
import type { StrategyWire } from "./protocol";
import { RecordCard } from "./RecordCard";
import { TopUpCopy } from "./TopUpCopy";
import type { CopyWrites } from "./useCopyWrites";
import "./desk.css";
import "../agents/cockpit.css";
import "@/components/kit/kit.css";

const D = {
  limits: "Your limits",
  spent: "Spent today",
  open: "Open",
  resets: "resets 00:00 UTC",
  left: "Budget left",
  result: "Your result",
  copiers: "Copiers",
  fees: "Fees earned",
  manage: "Manage →",
  review: "Copy →",
};
const share = (part: bigint, whole: bigint) => (whole <= 0n ? 0 : Number((part * 10_000n) / whole) / 100);

export function LiveDesk({ card, writes, onManage }: { card: StrategyWire; writes: CopyWrites; onManage: () => void }) {
  const { name, seed } = strategyIdentity(card);
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const sub = writes.mine.find((m) => m.strategyId === card.strategyId) ?? null;
  const grant = sub && writes.grant && writes.grant.grantId.toString() === sub.grantId ? writes.grant : null;
  const state = copyStateOf(card, sub, writes.grant, nowSec);
  const isCreator = writes.wallet !== null && writes.wallet.toLowerCase() === card.creator.toLowerCase();
  const fills = writes.myFills.filter((f) => f.strategyId === card.strategyId);
  const net = fills.reduce((s, f) => s + (f.pnlBase === null ? 0n : BigInt(f.pnlBase)), 0n);
  const live = state === "copying" || state === "fading";
  const pulse = pulseOf(card, nowMs);
  const spent = grant ? spentTodayOf(grant, nowSec) : 0n;
  // Privacy mode (the balance eye, R4-4 critic gap 15): spent today, the budget left, the copier's result and the fees
  // earned are the account's own money — the dots; the caps are settings and the gauges' shares stay.
  const own = usePrivacy() ? () => SHELL.masked : usd;
  return (
    <section className="desk" aria-label={name}>
      <div className="desk-body flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <AgentPortrait seed={seed} name={name} />
          <div className="min-w-0">
            <h2 className="desk-name text-ink">{name}</h2>
            <p className="desk-what text-ink/70">{instinctOf(card)}</p>
          </div>
        </div>
        <RecordCard record={card.record} />
        <div className="desk-pulse border-accent">
          <StatusDot tone={live ? "live" : state === "not-copying" ? "quiet" : "warn"}>
            <span className="desk-status text-ink">{COPY_STATE_LABEL[state]}</span>
          </StatusDot>
          <p className="desk-pulse-line">{pulse.line}{card.health.lastTickMs !== null ? ` · ${ago(card.health.lastTickMs, nowMs)}` : ""}</p>
        </div>
        {sub && <TopUpCopy writes={writes} name={name} />}
        {grant && (
          <div className="flex flex-col gap-3">
            <p className="desk-eyebrow text-ink/40">{D.limits}</p>
            <div className="cp-gauges">
              <Gauge label={D.spent} value={share(spent, grant.caps.maxDailySpendBase)} center={`${Math.round(share(spent, grant.caps.maxDailySpendBase))}%`} line={`${own(spent)} / ${usd(grant.caps.maxDailySpendBase)} · ${D.resets}`} />
              <Gauge label={D.open} value={grant.caps.maxOpenPositions > 0 ? (grant.openPositions / grant.caps.maxOpenPositions) * 100 : 0} center={`${grant.openPositions}/${grant.caps.maxOpenPositions}`} line={`${usd(grant.caps.maxStakePerTradeBase)} / trade`} />
            </div>
            <div className="desk-numbers">
              <div><p className="desk-eyebrow">{D.left}</p><p className="desk-figure"><Masked>{usd(grant.budgetBase)}</Masked></p></div>
              <div><p className="desk-eyebrow">{D.result}</p><p className={cn("desk-figure", net > 0n ? "text-profit" : net < 0n ? "text-loss" : "")}>{fills.length === 0 ? "—" : <Masked>{usdSigned(net)}</Masked>}</p></div>
            </div>
          </div>
        )}
        {isCreator && (
          <div className="flex flex-col gap-4 border-t border-hairline pt-4">
            <div className="desk-numbers">
              <div><p className="desk-eyebrow">{D.copiers}</p><p className="desk-figure">{card.subscribers}</p></div>
              <div><p className="desk-eyebrow">{D.fees}</p><p className="desk-figure"><Masked>{usd(BigInt(card.feesEarnedBase))}</Masked></p></div>
            </div>
            {writes.wallet && <SealMemory card={card} wallet={writes.wallet} />}
          </div>
        )}
        <button type="button" onClick={onManage} className="desk-btn-primary self-start">{sub ? D.manage : D.review}</button>
      </div>
    </section>
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
