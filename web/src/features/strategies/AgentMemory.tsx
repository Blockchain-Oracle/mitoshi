"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/AgentMemory.tsx (R4-6, D-227) — a strategy's last decisions
// (an agent's reads, a rule's calls — R6 #9), one row each: when and which Window, the outcome, "UP · 0.72 → sent UP ·
// 1 filled" (or held), the why clamped to two lines and, when it held, the gate's ruling in words ("Held — 55% sure,
// under its 60% floor"; `gate-words`). A row opens the whole decision (DecisionDetail).
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DECISION, DecisionDetail, callOf, rulingOf } from "./DecisionDetail";
import { gateOf, whyOf } from "./gate-words";
import { ago } from "./names";
import type { DecisionDetailWire, DecisionWire, FillWire } from "./protocol";
import "./strategies.css";
import "./decision.css";

function MemoryRow({ d, nowMs, onOpen }: { d: DecisionWire; nowMs: number; onOpen: () => void }) {
  const why = whyOf(d);
  return (
    <button type="button" className="strat-memory-row strat-memory-open" onClick={onOpen} aria-label={`${DECISION.open}: ${ago(d.decidedAtMs, nowMs)}, ${callOf(d)}`}>
      <span className="strat-mono-10 flex items-baseline justify-between gap-2 text-ink/40">
        <span className="truncate">{ago(d.decidedAtMs, nowMs)}{d.label ? ` · ${d.label}` : ""}</span>
        <span className="flex shrink-0 items-baseline gap-2">
          {d.outcome && <span className={cn("uppercase", d.outcome === "won" ? "text-profit" : d.outcome === "lost" ? "text-loss" : "text-ink/30")}>{DECISION.outcome[d.outcome]}</span>}
          <span className="strat-memory-more" aria-hidden>→</span>
        </span>
      </span>
      <span className="strat-mono-11 mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className={cn(d.gate === "failed" ? "text-ink/50" : "text-ink")}>{callOf(d)}</span>
        <span className={cn(d.gate === "trade" ? "text-accent" : "text-ink/50")}>→ {rulingOf(d)}</span>
      </span>
      {why && <span className="mt-1 line-clamp-2 block text-xs leading-snug text-ink-secondary">{why}</span>}
      {d.gate !== "trade" && <span className="strat-mono-10 mt-0.5 line-clamp-1 block text-ink/50">{gateOf(d)}</span>}
    </button>
  );
}

/** `heading`: an agent's "Model · …", a rule's name; `total` every decision it made (the rows are the latest). */
export function AgentMemory({ decisions, heading, total, agentName, fills }: { decisions: readonly (DecisionWire | DecisionDetailWire)[]; heading: string; total: number; agentName: string; fills: readonly FillWire[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = decisions.find((d) => d.marketId === openId) ?? null;
  const nowMs = Date.now();
  return (
    <div className="flex flex-col">
      <p className="strat-mono-10 truncate text-ink/40">{heading}{total > decisions.length ? ` · ${DECISION.latest(decisions.length, total)}` : ""}</p>
      {decisions.length === 0 ? (
        <p className="strat-mono-11 mt-2 text-ink-muted">{DECISION.empty}</p>
      ) : (
        <div className="mt-2">
          {decisions.map((d) => <MemoryRow key={d.marketId} d={d} nowMs={nowMs} onOpen={() => setOpenId(d.marketId)} />)}
        </div>
      )}
      <DecisionDetail decision={open} agentName={agentName} fills={fills} onClose={() => setOpenId(null)} />
    </div>
  );
}
