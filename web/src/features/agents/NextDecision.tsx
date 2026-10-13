"use client";
// Ported from Owarine 90a91d71:web/src/features/desk/cockpit/CheckStrip.tsx (R4-6, D-227), rebuilt for R6 #9 (D-230):
// the card beside the record — a ring counting down to the agent's next decision (`next-decision.ts`: its read slot,
// or the time left to call this Window, or the next Window), the runner's last pass in words (`pulse.ts`, never its log
// line) and its last decision with its time and result, which opens the Decisions tab. The shared clock reads 0 before
// its first tick: the ring then shows "—", never a countdown from 1970 ("29865024:42").
import { formatCadence, formatClock, isOk } from "@cwf/core";
import { useLanes } from "@cwf/markets/react";
import { ChevronRight } from "lucide-react";
import { CountdownRing } from "@/components/data/CountdownRing";
import { useNowMs } from "@/components/data/useNowMs";
import { cn } from "@/lib/utils";
import { callOf, DECISION } from "../strategies/DecisionDetail";
import { ago } from "../strategies/names";
import type { DecisionWire, StrategyWire } from "../strategies/protocol";
import { AGENTS } from "./copy";
import { nextDecisionOf, type NextDecision as Next } from "./next-decision";
import { pulseOf } from "./pulse";

const N = AGENTS.cockpit.next;

function words(s: StrategyWire, next: Next, clock: string, pulse: string): { lead: string; sub: string | null } {
  if (next.kind === "unknown") return { lead: pulse, sub: null };
  const label = s.envelope.seriesLabel ?? (next.kind === "closed" ? AGENTS.pulse.anyWindow : `${next.market.asset} ${formatCadence(next.market.intervalSec)}`);
  const agent = s.spec?.preset === "agent";
  switch (next.kind) {
    case "closed": return { lead: N.closed(label), sub: N.closedWhy };
    case "watching": return { lead: pulse, sub: `${clock} ${N.toCall}` };
    case "reading": return { lead: N.reading(label), sub: `${clock} ${N.readLeft}` };
    case "reads-in": return { lead: N.readNext(label), sub: `${N.readsIn} in ${clock}` };
    case "decided": return { lead: next.decision.side ? N.called(next.decision.side.toUpperCase(), label) : N.held(label), sub: `${agent ? N.nextRead : N.nextWindow} in ${clock}` };
    case "between": return { lead: N.late(label), sub: `${agent ? N.nextRead : N.nextWindow} in ${clock}` };
  }
}

export function NextDecision({ s, decisions, onOpenDecisions }: { s: StrategyWire; decisions: readonly DecisionWire[]; onOpenDecisions: () => void }) {
  const nowMs = useNowMs();
  const lanes = useLanes();
  const markets = lanes && isOk(lanes) ? lanes.value.lanes.flatMap((l) => l.markets) : null;
  const pulse = pulseOf(s, nowMs || Date.now());
  const next: Next = pulse.deciding ? nextDecisionOf(s, markets, decisions, nowMs) : { kind: "unknown" };
  const timed = "atSec" in next ? next : null;
  const left = timed ? Math.max(0, timed.atSec - Math.floor(nowMs / 1000)) : 0;
  const clock = formatClock(left);
  const waiting = s.health.state?.kind === "idle" && (s.health.state.idle === "no-copier" || s.health.state.idle === "no-live-budget");
  const { lead, sub } = pulse.deciding ? words(s, next, clock, pulse.line) : { lead: pulse.line, sub: waiting ? N.idleWhy : null };
  // The pass's own trouble (a call no copier could take) stays in view under the countdown.
  const trouble = pulse.deciding && pulse.tone === "warn" && lead !== pulse.line ? pulse.line : null;
  const last = decisions[0] ?? null;
  return (
    <section className="cp-card cp-check" aria-label={N.title}>
      <span className="cp-stat-label">{N.title}</span>
      <div className="cp-check-main">
        <CountdownRing fraction={timed ? left / timed.spanSec : 0} urgent={timed !== null && left <= 10} className="cp-ring">
          <span className="cp-ring-text" role="timer">{timed ? clock : "—"}</span>
        </CountdownRing>
        <div className="cp-check-text">
          <p className="cp-check-lead">{lead}</p>
          {sub && <p className="type-caption text-ink-secondary">{sub}</p>}
          {trouble && <p className="cp-check-warn">{trouble}</p>}
        </div>
      </div>
      <button type="button" className="cp-last" onClick={onOpenDecisions} disabled={!last}>
        <span className="cp-stat-label">{N.last}</span>
        {last ? (
          <span className="cp-last-line">
            <b>{callOf(last)}</b>
            <span>{nowMs > 0 ? ago(last.decidedAtMs, nowMs) : "—"}</span>
            {last.outcome && last.side && <span className={cn("cp-last-outcome", `cp-last-outcome--${last.outcome}`)}>{DECISION.outcome[last.outcome]}</span>}
            <ChevronRight aria-hidden className="cp-last-go" />
          </span>
        ) : (
          <span className="cp-last-line text-ink-muted">{N.none}</span>
        )}
      </button>
    </section>
  );
}
