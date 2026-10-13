"use client";
// Ported from Owarine 90a91d71:web/src/features/desk/activity/{ActivityTimeline,CheckCard}.tsx (R4-6, D-227) — an
// agent's decisions as a timeline (the desk kit's Timeline, 21st #28276 / #29318): filter chips with counts (All ·
// Called · Held · Failed — every decision it made, not the page's latest; R6 #9), a head per day, each decision a node
// in its tone with a card — the time, a badge for its outcome or ruling, "UP · 0.72 → sent UP · 1 filled" (a rule's
// call has no confidence), the why clamped to two lines. A card opens the whole decision.
import { isRuleModel } from "@cwf/core";
import { Ban, Check, CircleDashed, OctagonAlert } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { EmptyState, Timeline, TimelineDay, TimelineNode, type NodeTone } from "@/components/kit/desk-kit";
import { DecisionDetail, callOf, rulingOf, DECISION } from "../strategies/DecisionDetail";
import { ago } from "../strategies/names";
import type { DecisionDetailWire, DecisionsWire, FillWire } from "../strategies/protocol";
import { AGENTS } from "./copy";
import "./activity.css";

type Filter = "all" | "bet" | "held" | "failed";
const C = AGENTS.cockpit;
const toneOf = (d: DecisionDetailWire): NodeTone => (d.gate === "trade" ? "acted" : d.gate === "failed" ? "error" : d.gate === "pending" ? "quiet" : "declined");
const kindOf = (d: DecisionDetailWire): Filter => (d.gate === "trade" ? "bet" : d.gate === "failed" ? "failed" : "held");
const ICON: Record<NodeTone, ReactNode> = { acted: <Check strokeWidth={2.75} />, declined: <Ban />, quiet: <CircleDashed />, asked: <CircleDashed />, stopped: <OctagonAlert />, error: <OctagonAlert />, neutral: <CircleDashed /> };
const dayOf = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const timeOf = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** One decision as a card: its time, its badge, the call and ruling, the why in two lines. */
export function DecisionCard({ d, nowMs, onOpen }: { d: DecisionDetailWire; nowMs: number; onOpen: () => void }) {
  const tone = toneOf(d);
  return (
    <button type="button" className="act-check w-full text-left" data-tone={tone} onClick={onOpen} aria-label={`${DECISION.open}: ${callOf(d)}`}>
      <span className="act-check-head">
        <span className="act-time">{timeOf(d.decidedAtMs)}</span>
        <span className="act-badge" data-tone={tone}>{d.outcome && d.side ? DECISION.outcome[d.outcome] : C.filters[kindOf(d)]}</span>
        <span className="act-meta">{ago(d.decidedAtMs, nowMs)}{d.label ? ` · ${d.label}` : ""}</span>
      </span>
      <span className="act-line-lead block px-0.5"><b className="act-figure">{callOf(d)}</b> → {rulingOf(d)}</span>
      <span className="act-line-rest line-clamp-2 block px-0.5">{isRuleModel(d.model) ? d.why : `“${d.why}”`}</span>
    </button>
  );
}

export function DecisionTimeline({ decisions, counts: total, fills, agentName }: { decisions: readonly DecisionDetailWire[]; counts: Pick<DecisionsWire, "total" | "bets" | "held" | "failed">; fills: readonly FillWire[]; agentName: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  // The chips count every decision it made; the timeline lists the latest the page read.
  const counts = useMemo<Record<Filter, number>>(() => ({ all: Math.max(total.total, decisions.length), bet: total.bets, held: total.held, failed: total.failed }), [total, decisions.length]);
  const shown = filter === "all" ? decisions : decisions.filter((d) => kindOf(d) === filter);
  const nowMs = Date.now();
  if (decisions.length === 0) return <EmptyState icon={<CircleDashed />} title={C.noDecisions} body={C.noDecisionsWhy} />;
  let lastDay = "";
  return (
    <div className="act">
      {counts.all > decisions.length && <p className="act-shown">{C.shown(decisions.length, counts.all)}</p>}
      <div className="act-filters" role="group" aria-label={C.tabs.decisions}>
        {(["all", "bet", "held", "failed"] as const).filter((f) => f === "all" || counts[f] > 0).map((f) => (
          <button key={f} type="button" className="act-filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {C.filters[f]}
            <span className="act-filter-count">{counts[f]}</span>
          </button>
        ))}
      </div>
      <Timeline label={C.tabs.decisions}>
        {shown.flatMap((d, i) => {
          const day = dayOf(d.decidedAtMs);
          const nodes: ReactNode[] = [];
          if (day !== lastDay) {
            lastDay = day;
            nodes.push(<TimelineDay key={`day-${day}`}>{day}</TimelineDay>);
          }
          nodes.push(
            <TimelineNode key={d.marketId} icon={ICON[toneOf(d)]} tone={toneOf(d)} index={i}>
              <DecisionCard d={d} nowMs={nowMs} onOpen={() => setOpenId(d.marketId)} />
            </TimelineNode>,
          );
          return nodes;
        })}
      </Timeline>
      <DecisionDetail decision={decisions.find((d) => d.marketId === openId) ?? null} agentName={agentName} fills={fills} onClose={() => setOpenId(null)} />
    </div>
  );
}
