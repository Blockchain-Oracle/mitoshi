"use client";
// Ported from Owarine 90a91d71:web/src/features/desk/activity/{ActivityTimeline,CheckCard}.tsx (R4-6, D-227) — an
// agent's decisions as a timeline (the desk kit's Timeline, 21st #28276 / #29318): filter chips with counts (All · Bet ·
// Held · Failed), a head per day, each decision a node in its tone with a card — the time, a badge for its outcome or
// ruling, "UP · 0.72 → sent UP · 1 filled", the why clamped to two lines. A card opens the whole decision.
import { Ban, Check, CircleDashed, OctagonAlert } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { EmptyState, Timeline, TimelineDay, TimelineNode, type NodeTone } from "@/components/kit/desk-kit";
import { DecisionDetail, callOf, rulingOf, DECISION } from "../strategies/DecisionDetail";
import { ago } from "../strategies/names";
import type { DecisionDetailWire, FillWire } from "../strategies/protocol";
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
        <span className="act-badge" data-tone={tone}>{d.outcome && d.side ? DECISION.outcome[d.outcome] : kindOf(d)}</span>
        <span className="act-meta">{ago(d.decidedAtMs, nowMs)}{d.label ? ` · ${d.label}` : ""}</span>
      </span>
      <span className="act-line-lead block px-0.5"><b className="act-figure">{callOf(d)}</b> → {rulingOf(d)}</span>
      <span className="act-line-rest line-clamp-2 block px-0.5">“{d.why}”</span>
    </button>
  );
}

export function DecisionTimeline({ decisions, fills, agentName }: { decisions: readonly DecisionDetailWire[]; fills: readonly FillWire[]; agentName: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: decisions.length, bet: 0, held: 0, failed: 0 };
    for (const d of decisions) c[kindOf(d)] += 1;
    return c;
  }, [decisions]);
  const shown = filter === "all" ? decisions : decisions.filter((d) => kindOf(d) === filter);
  const nowMs = Date.now();
  if (decisions.length === 0) return <EmptyState icon={<CircleDashed />} title={C.noDecisions} />;
  let lastDay = "";
  return (
    <div className="act">
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
