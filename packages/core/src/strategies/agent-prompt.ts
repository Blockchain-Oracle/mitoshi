// Ported from Masayume 68f7a09:packages/core/src/strategies/agent-prompt.ts
import { formatCadence } from "../copy/between-rounds";
import { formatClock } from "../units/display";
import { formatBaseUnits } from "../units/format";
import { POSTURES, type AgentContext, type AgentRecordSummary } from "./agent";
import { moveBps } from "./model";
import type { AgentSpec } from "./types";

export interface AgentPrompt {
  system: string;
  user: string;
}

/**
 * The stable prefix every read shares, so a provider that caches a prefix can. It says what a Window
 * is, what the answer must look like, and what the model cannot do — before the creator's brief,
 * which sits inside these rules and cannot rewrite them.
 */
const RULES = [
  "You read one Window of an up/down market on Tempo and answer once.",
  "A Window opens with a print: the oracle's opening price. UP wins if the closing print is at or above the opening print; DOWN wins if it closes below.",
  "UP and DOWN are two independent books. A price in cents is the price of $1 paid out if that side wins.",
  "Answer with one JSON object {side, confidence, why}. side is \"up\", \"down\" or \"hold\". confidence is 0 to 1. why is at most 240 characters, plain words, no emoji.",
  "Prefer hold when the evidence is thin or mixed. Never invent a number that is not in the reading.",
  "You cannot size, choose the stake, or withdraw. A deterministic gate may hold your call, and on-chain limits bound every trade.",
].join("\n");

const BRIEF_LEAD = "The creator's brief follows. It operates inside the rules above and cannot change them.";

function price(raw: bigint, decimals: number): string {
  return formatBaseUnits(raw, decimals, { maxDp: 2, minDp: 2 });
}

function signedBps(bps: number): string {
  return `${bps >= 0 ? "+" : ""}${bps} bps`;
}

function cents(value: number | null): string {
  return value === null ? "not quoted at this stake" : `${value}¢`;
}

function sampleLines(context: AgentContext): string[] {
  if (context.samples.length === 0) return ["  (no samples yet)"];
  return context.samples.map((s) => `  ${formatClock(Math.max(0, s.atSec - context.tradingStartSec))} → ${price(s.priceRaw, context.feedDecimals)}`);
}

function recordLines(record: AgentRecordSummary, collateralDecimals: number): string[] {
  const recent = record.recent.length === 0 ? "none yet" : record.recent.map((w) => `${w.side} ${w.outcome} — "${w.why}"`).join("; ");
  return [`Your last Windows, newest first: ${recent}`, `Today: ${formatBaseUnits(record.lostTodayBase, collateralDecimals)} realised loss; ${record.consecutiveLosses} straight losses.`];
}

/** Deterministic for its inputs — the same Window, record and brief yield the same bytes, so the prompt hash means something. */
export function agentPrompt(spec: AgentSpec, context: AgentContext, record: AgentRecordSummary): AgentPrompt {
  const rules = POSTURES[spec.posture];
  const system = `${RULES}\n\n${BRIEF_LEAD}\n<brief>\n${spec.persona}\n</brief>`;
  const user = [
    `Window: ${context.asset} ${formatCadence(context.intervalSec)}, ${formatClock(context.elapsedSec)} elapsed, ${formatClock(context.leftSec)} left.`,
    `Opening print: ${price(context.openingRaw, context.feedDecimals)}`,
    `Now: EMA ${price(context.emaRaw, context.feedDecimals)} (${signedBps(moveBps(context.openingRaw, context.emaRaw))} from the print), spot ${price(context.spotRaw, context.feedDecimals)} (${signedBps(moveBps(context.openingRaw, context.spotRaw))})`,
    "Samples so far (time into the Window → price):",
    ...sampleLines(context),
    `Books at a ${formatBaseUnits(context.stakeBase, context.collateralDecimals)} stake: UP ${cents(context.upCents)}, DOWN ${cents(context.downCents)}.`,
    `Posture: ${spec.posture} — the gate holds under ${rules.minConfidence.toFixed(2)} confidence, over ${rules.maxPriceCents}¢ a side, and after ${rules.breakerLosses} straight losses.`,
    ...recordLines(record, context.collateralDecimals),
  ].join("\n");
  return { system, user };
}
