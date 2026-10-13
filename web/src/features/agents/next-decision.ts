// When a strategy decides next (R6 #9, D-230), from the live Windows of its series (the lanes read) and its own
// recorded decisions — never from the runner's heartbeat, whose "next beat" is a promise of a log line, not of a
// decision (the cockpit used to park at "0:00 · Due now"). An agent reads a Window once, in its decision slot (core
// `decisionSlot`); a rule or a mirror calls a Window at most once, any time before the no-entry cutoff its trigger
// holds — and either only once the Window's opening print is in, as the runner reads it. Pure: `nowMs` 0 (the shared
// clock before its first tick) answers "unknown", never a countdown from 1970.
import { decisionSlot, noEntryCutoffSec, type EventMarket } from "@cwf/core";
import type { DecisionWire, StrategyWire } from "../strategies/protocol";

export type NextDecision =
  /** The clock or the lanes aren't read yet. */
  | { kind: "unknown" }
  /** No started Window of its series (a stock lane out of hours, or between Windows). */
  | { kind: "closed" }
  /** Its Window has started but its opening print isn't in: the runner decides nothing until it is. */
  | { kind: "awaiting-print"; market: EventMarket }
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

type Option = Exclude<NextDecision, { kind: "unknown" } | { kind: "closed" }>;
/** A Window it can decide now first, then one it decides once its print lands, then the soonest wait. */
const rank = (o: Option) => (o.kind === "watching" || o.kind === "reading" ? 0 : o.kind === "awaiting-print" ? 1 : 2);
const atOf = (o: Option) => ("atSec" in o ? o.atSec : 0);

/** The Windows the runner reads for it — its series, or scoped to any every crypto 5-minute series (the runner's own
 *  `seriesOf`), an agent only on its cadences — that are open, started and not yet expired. */
function windowsOf(s: Pick<StrategyWire, "spec" | "envelope">, markets: readonly EventMarket[], nowSec: number): EventMarket[] {
  const series = s.envelope.series?.toLowerCase() ?? null;
  const cadences = s.spec?.preset === "agent" ? s.spec.cadences : null;
  return markets.filter((m) => (series ? m.seriesId.toLowerCase() === series : m.lane === "crypto24" && m.intervalSec === 300) && (!cadences || cadences.includes(m.intervalSec)) && m.state === "open" && m.tradingStartSec <= nowSec && nowSec < m.expirySec);
}

/** The runner's own rule (`tradingWindowsOf`): it decides a Window only while it can still enter it (before the
 *  no-entry cutoff; an agent, inside its read slot) and only once its opening print is in. */
function nextOn(m: EventMarket, agent: boolean, decided: DecisionWire | undefined, nowSec: number, nowMs: number): Option {
  // The next Window of a series opens as this one expires; an agent reads it a quarter of the way in.
  const nextAt = agent ? m.expirySec + Math.floor(m.intervalSec / 4) : m.expirySec;
  if (decided) return { kind: "decided", atSec: nextAt, spanSec: Math.max(1, nextAt - Math.floor(decided.decidedAtMs / 1000)), market: m, decision: decided };
  const cutoff = noEntryCutoffSec({ lockAtSec: m.lockAtSec, intervalSec: m.intervalSec });
  const slot = agent ? decisionSlot(m, nowMs) : null;
  const lastSec = slot ? Math.min(slot.closesAtSec, cutoff) : cutoff;
  if (nowSec >= lastSec) return { kind: "between", atSec: nextAt, spanSec: Math.max(1, nextAt - lastSec), market: m };
  if (m.openingPriceRaw === null) return { kind: "awaiting-print", market: m };
  if (!slot) return { kind: "watching", atSec: cutoff, spanSec: Math.max(1, cutoff - m.tradingStartSec), market: m };
  if (slot.open) return { kind: "reading", atSec: lastSec, spanSec: Math.max(1, lastSec - slot.opensAtSec), market: m };
  return { kind: "reads-in", atSec: slot.opensAtSec, spanSec: Math.max(1, slot.opensAtSec - m.tradingStartSec), market: m };
}

/** `markets` null: the lanes aren't read yet. */
export function nextDecisionOf(s: Pick<StrategyWire, "spec" | "envelope">, markets: readonly EventMarket[] | null, decisions: readonly DecisionWire[], nowMs: number): NextDecision {
  if (nowMs <= 0 || markets === null) return { kind: "unknown" };
  const nowSec = Math.floor(nowMs / 1000);
  const agent = s.spec?.preset === "agent";
  const byMarket = new Map(decisions.map((d) => [d.marketId.toLowerCase(), d]));
  const options = windowsOf(s, markets, nowSec).map((m) => nextOn(m, agent, byMarket.get(m.marketId.toLowerCase()), nowSec, nowMs));
  if (options.length === 0) return { kind: "closed" };
  return options.sort((a, b) => rank(a) - rank(b) || atOf(a) - atOf(b))[0]!;
}
