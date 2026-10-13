// When a strategy decides next (R6 #9, D-230), from the live Windows of its series (the lanes read) and its own
// recorded decisions — never from the runner's heartbeat, whose "next beat" is a promise of a log line, not of a
// decision (the cockpit used to park at "0:00 · Due now"). An agent reads a Window once, in its decision slot (core
// `decisionSlot`); a rule or a mirror calls a Window at most once, any time before the no-entry cutoff its trigger
// holds. Pure: `nowMs` 0 (the shared clock before its first tick) answers "unknown", never a countdown from 1970.
import { decisionSlot, noEntryCutoffSec, phase, type EventMarket } from "@cwf/core";
import type { DecisionWire, StrategyWire } from "../strategies/protocol";

export type NextDecision =
  /** The clock or the lanes aren't read yet. */
  | { kind: "unknown" }
  /** No trading Window of its series (a stock lane out of hours, or the opening print not in yet). */
  | { kind: "closed" }
  /** A rule may still call this Window until `atSec` (the no-entry cutoff). */
  | { kind: "watching"; atSec: number; spanSec: number; market: EventMarket }
  /** An agent is inside its read slot, which closes at `atSec`. */
  | { kind: "reading"; atSec: number; spanSec: number; market: EventMarket }
  /** An agent's read slot on this Window opens at `atSec`. */
  | { kind: "reads-in"; atSec: number; spanSec: number; market: EventMarket }
  /** This Window is decided (`decision`); the next decision can come from `atSec`. */
  | { kind: "decided"; atSec: number; spanSec: number; market: EventMarket; decision: DecisionWire }
  /** Too late for this Window (past the cutoff or the slot); the next can be decided from `atSec`. */
  | { kind: "between"; atSec: number; spanSec: number; market: EventMarket };

type Timed = Exclude<NextDecision, { kind: "unknown" } | { kind: "closed" }>;
const ACTIVE: ReadonlySet<Timed["kind"]> = new Set(["watching", "reading"]);

/** A Window that is trading, or past its entry cutoff but not yet expired (its successor opens at its expiry). */
const LIVE: ReadonlySet<string> = new Set(["trading", "noEntryBuffer", "locked"]);

/** The Windows the runner trades for it: its series, or — scoped to any — every crypto 5-minute series (the runner's
 *  own `seriesOf`); an agent only on its cadences. */
function windowsOf(s: Pick<StrategyWire, "spec" | "envelope">, markets: readonly EventMarket[], nowMs: number): EventMarket[] {
  const series = s.envelope.series?.toLowerCase() ?? null;
  const cadences = s.spec?.preset === "agent" ? s.spec.cadences : null;
  return markets.filter((m) => (series ? m.seriesId.toLowerCase() === series : m.lane === "crypto24" && m.intervalSec === 300) && (!cadences || cadences.includes(m.intervalSec)) && nowMs < m.expirySec * 1000 && LIVE.has(phase(m, nowMs)));
}

function nextOn(m: EventMarket, agent: boolean, decided: DecisionWire | undefined, nowSec: number, nowMs: number): Timed {
  const span = Math.max(1, m.expirySec - m.tradingStartSec);
  // The next Window of a series opens as this one expires; an agent reads it a quarter of the way in.
  const nextAt = agent ? m.expirySec + Math.floor(m.intervalSec / 4) : m.expirySec;
  if (decided) return { kind: "decided", atSec: nextAt, spanSec: Math.max(1, nextAt - Math.floor(decided.decidedAtMs / 1000)), market: m, decision: decided };
  if (agent) {
    const slot = decisionSlot(m, nowMs);
    if (slot.open) return { kind: "reading", atSec: slot.closesAtSec, spanSec: Math.max(1, slot.closesAtSec - slot.opensAtSec), market: m };
    if (nowSec < slot.opensAtSec) return { kind: "reads-in", atSec: slot.opensAtSec, spanSec: Math.max(1, slot.opensAtSec - m.tradingStartSec), market: m };
    return { kind: "between", atSec: nextAt, spanSec: Math.max(1, nextAt - slot.closesAtSec), market: m };
  }
  const cutoff = noEntryCutoffSec({ lockAtSec: m.lockAtSec, intervalSec: m.intervalSec });
  if (nowSec < cutoff) return { kind: "watching", atSec: cutoff, spanSec: Math.max(1, cutoff - m.tradingStartSec), market: m };
  return { kind: "between", atSec: nextAt, spanSec: Math.max(1, Math.min(span, nextAt - cutoff)), market: m };
}

/** `markets` null: the lanes aren't read yet. */
export function nextDecisionOf(s: Pick<StrategyWire, "spec" | "envelope">, markets: readonly EventMarket[] | null, decisions: readonly DecisionWire[], nowMs: number): NextDecision {
  if (nowMs <= 0 || markets === null) return { kind: "unknown" };
  const nowSec = Math.floor(nowMs / 1000);
  const agent = s.spec?.preset === "agent";
  const byMarket = new Map(decisions.map((d) => [d.marketId.toLowerCase(), d]));
  const options = windowsOf(s, markets, nowMs).map((m) => nextOn(m, agent, byMarket.get(m.marketId.toLowerCase()), nowSec, nowMs));
  if (options.length === 0) return { kind: "closed" };
  // A Window it can decide now beats one it is waiting on; then the soonest.
  return options.sort((a, b) => Number(ACTIVE.has(b.kind)) - Number(ACTIVE.has(a.kind)) || a.atSec - b.atSec)[0]!;
}
