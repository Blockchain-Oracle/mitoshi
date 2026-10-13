// The gate's ruling on an agent's read in words (R6 #9, D-230), read from the stored reason as data (core
// `readGateReason`) — never the raw line ("agent bets down (0.76): …", "confidence 0.55 under the guarded floor 0.60: …"):
// "Down, 76% sure", "Held — 55% sure, under its 60% floor", "No answer — the model timed out". The model's own reason
// is the quote beside it (`whyOf`), never repeated in the ruling; a failed read's `why` is the error, never shown.
import { isRuleModel, readGateReason, type AgentReadFailure, type Side } from "@cwf/core";
import type { DecisionWire } from "./protocol";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const GATE = {
  bet: (side: Side, confidence: number) => `${side === "up" ? "Up" : "Down"}, ${pct(confidence)} sure`,
  modelHeld: "Held by the model",
  unsure: (confidence: number, floor: number) => `Held — ${pct(confidence)} sure, under its ${pct(floor)} floor`,
  breaker: (losses: number) => `Held — paused after ${losses} straight losses`,
  lossLine: "Held — past its daily loss line",
  unquoted: (side: Side) => `Held — no ${side.toUpperCase()} price at its stake`,
  tooDear: (side: Side, cents: number, capCents: number) => `Held — ${side.toUpperCase()} cost ${cents}¢, over its ${capCents}¢ cap`,
  failure: {
    timeout: "No answer — the model timed out",
    parse: "No answer — its reply couldn't be read",
    upstream: "No answer — the model couldn't be reached",
    refusal: "No answer — the model declined",
  } as Record<AgentReadFailure, string>,
  interrupted: "No answer — the runner restarted mid-read",
  /** A line no known format matches (an older row): the ruling alone. */
  byGate: { trade: "Called", held: "Held", failed: "No answer from the model", pending: "Reading" } as Record<DecisionWire["gate"], string>,
};

/** An agent gate's reason in words; `gate` words a line it can't read. */
export function gateWords(reason: string, gate: DecisionWire["gate"]): string {
  const r = readGateReason(reason);
  switch (r.kind) {
    case "bet": return GATE.bet(r.side, r.confidence);
    case "model-held": return GATE.modelHeld;
    case "unsure": return GATE.unsure(r.confidence, r.floor);
    case "breaker": return GATE.breaker(r.losses);
    case "loss-line": return GATE.lossLine;
    case "unquoted": return GATE.unquoted(r.side);
    case "too-dear": return GATE.tooDear(r.side, r.cents, r.capCents);
    case "no-answer": return r.failure ? GATE.failure[r.failure] : GATE.byGate.failed;
    case "interrupted": return GATE.interrupted;
    case "other": return GATE.byGate[gate];
  }
}

type Said = Pick<DecisionWire, "model" | "verdictSide" | "why" | "gate" | "gateReason">;

/** The ruling in words: a rule's is already its trigger in words ("0.08% move, past its 0.05% trigger"). */
export const gateOf = (d: Said): string => (isRuleModel(d.model) ? d.gateReason : gateWords(d.gateReason, d.gate));

/** What the decision says for itself: a rule's call in its words, the model's own reason quoted, or null when the
 *  model gave none. */
export const whyOf = (d: Said): string | null => (isRuleModel(d.model) ? d.why : d.verdictSide === "none" ? null : `“${d.why}”`);
