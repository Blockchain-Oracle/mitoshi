// Ported from Masayume 68f7a09:packages/core/src/strategies/agent.ts
import { z } from "zod";
import { formatCadence } from "../copy/between-rounds";
import type { EventMarket, Side } from "../types/market";
import { formatBaseUnits } from "../units/format";
import { mulBps } from "../units/money";
import { msToSec } from "../units/time";
import { capResetsAtSec } from "../vault/caps";
import type { VaultCaps } from "../vault/types";
import { moveBps } from "./model";
import type { AgentPosture, AgentSpec, Decision } from "./types";

/** The Window cadences an agent may read — the venue's own lanes. */
export const AGENT_CADENCES_SEC: readonly number[] = [300, 900, 3_600, 14_400, 86_400];
export const AGENT_PERSONA_MAX_CHARS = 600;
export const AGENT_POSTURES: readonly AgentPosture[] = ["guarded", "balanced", "active"];

/** What the gate enforces for one posture. The cents caps mirror the desk's guarded/balanced/active copy. */
export interface PostureRules {
  minConfidence: number;
  maxPriceCents: number;
  breakerLosses: number;
  breakerPauseSec: number;
  /** Of the envelope's `maxDailySpendBase`: the realised loss today past which it holds until 00:00 UTC. */
  dailyLossBps: number;
}

export const POSTURES: Record<AgentPosture, PostureRules> = {
  guarded: { minConfidence: 0.75, maxPriceCents: 70, breakerLosses: 3, breakerPauseSec: 21_600, dailyLossBps: 2_500 },
  balanced: { minConfidence: 0.65, maxPriceCents: 85, breakerLosses: 4, breakerPauseSec: 14_400, dailyLossBps: 4_000 },
  active: { minConfidence: 0.55, maxPriceCents: 95, breakerLosses: 5, breakerPauseSec: 7_200, dailyLossBps: 6_000 },
};

/** The one shape the model may answer with. Anything else is a parse failure, and a parse failure holds. */
export const agentVerdictSchema = z.strictObject({ side: z.enum(["up", "down", "hold"]), confidence: z.number().min(0).max(1), why: z.string().min(1).max(240) });
export type AgentVerdict = z.infer<typeof agentVerdictSchema>;
export type AgentReadFailure = "timeout" | "parse" | "upstream" | "refusal";

export interface AgentSample {
  atSec: number;
  priceRaw: bigint;
}

/** Everything the prompt sees about one Window. Reads only; every figure is an integer on its own scale. */
export interface AgentContext {
  asset: string;
  intervalSec: number;
  tradingStartSec: number;
  openingRaw: bigint;
  emaRaw: bigint;
  spotRaw: bigint;
  feedDecimals: number;
  /** At most 12 points over the Window so far, oldest first. */
  samples: AgentSample[];
  /** Cents per $1 payout at `stakeBase`, or null when that side has nothing fillable at this size. */
  upCents: number | null;
  downCents: number | null;
  stakeBase: bigint;
  collateralDecimals: number;
  elapsedSec: number;
  leftSec: number;
}

export type AgentWindowOutcome = "won" | "lost" | "void" | "open";

export interface AgentPastWindow {
  side: Side;
  outcome: AgentWindowOutcome;
  why: string;
}

/** The agent's own track record, as the prompt and the gate read it. */
export interface AgentRecordSummary {
  /** The last decided Windows, newest first, at most five. */
  recent: AgentPastWindow[];
  consecutiveLosses: number;
  /** The largest realised loss any one subscriber took today (UTC), base units — measured against the envelope's daily cap. */
  lostTodayBase: bigint;
  lastLossAtSec: number | null;
}

export const EMPTY_AGENT_RECORD: AgentRecordSummary = { recent: [], consecutiveLosses: 0, lostTodayBase: 0n, lastLossAtSec: null };

const MIN_SLOT_TAIL_SEC = 60;

export interface DecisionSlot {
  open: boolean;
  opensAtSec: number;
  closesAtSec: number;
}

/**
 * One read per Window, a quarter of the way in: early enough to matter, late enough that the print
 * and a few samples exist. It closes before the no-entry tail so a call can still be sent.
 */
export function decisionSlot(market: Pick<EventMarket, "tradingStartSec" | "expirySec" | "intervalSec">, nowMs: number): DecisionSlot {
  const nowSec = msToSec(nowMs);
  const opensAtSec = market.tradingStartSec + Math.floor(market.intervalSec / 4);
  const closesAtSec = market.expirySec - Math.max(MIN_SLOT_TAIL_SEC, Math.floor(market.intervalSec / 5));
  return { open: nowSec >= opensAtSec && nowSec <= closesAtSec, opensAtSec, closesAtSec };
}

function joinWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The plain-words line the studio, the card and the drawer all show for an agent. */
export function describeAgentSpec(spec: AgentSpec, asset = "BTC"): string {
  const rules = POSTURES[spec.posture];
  const cadences = joinWords(spec.cadences.map(formatCadence));
  return `On ${asset} ${cadences} Windows it reads the print once, a quarter of the way in, and asks the model for up, down or hold. ${capitalize(spec.posture)}: it holds under ${Math.round(rules.minConfidence * 100)}% confidence, over ${rules.maxPriceCents}¢ a side, or after ${rules.breakerLosses} straight losses.`;
}

export interface GateInput {
  verdict: AgentVerdict | null;
  /** Why there is no verdict, when there is none: the read's failure in words. */
  failure?: string;
  spec: AgentSpec;
  context: AgentContext;
  record: AgentRecordSummary;
  envelope: VaultCaps;
  nowSec: number;
}

/**
 * The deterministic gate between a model's words and a `Decision`, checked in a fixed order: no
 * verdict → the model's own hold → the confidence floor → the loss breaker → the daily loss line →
 * the side's price. Only then does it bet. The phrase "bets up/down" is what the desk's status reads.
 */
export function gateAgentVerdict(input: GateInput): Decision {
  const { verdict, spec, context, record, envelope, nowSec } = input;
  const rules = POSTURES[spec.posture];
  const move = moveBps(context.openingRaw, context.emaRaw);
  const hold = (reason: string): Decision => ({ side: null, moveBps: move, thresholdBps: 0, reason });

  if (!verdict) return hold(`model unavailable: ${input.failure ?? "no verdict"}`);
  if (verdict.side === "hold") return hold(`agent held: ${verdict.why}`);
  const conf = verdict.confidence.toFixed(2);
  if (verdict.confidence < rules.minConfidence) return hold(`confidence ${conf} under the ${spec.posture} floor ${rules.minConfidence.toFixed(2)}: ${verdict.why}`);
  if (record.consecutiveLosses >= rules.breakerLosses && record.lastLossAtSec !== null && nowSec < record.lastLossAtSec + rules.breakerPauseSec) {
    const leftMin = Math.ceil((record.lastLossAtSec + rules.breakerPauseSec - nowSec) / 60);
    return hold(`breaker: ${record.consecutiveLosses} straight losses, paused ${leftMin} more min`);
  }
  const dailyLossLine = mulBps(envelope.maxDailySpendBase, rules.dailyLossBps);
  if (dailyLossLine > 0n && record.lostTodayBase >= dailyLossLine) {
    return hold(`down ${formatBaseUnits(record.lostTodayBase, context.collateralDecimals)} today, past the ${spec.posture} daily loss line; holding until 00:00 UTC (${capResetsAtSec(nowSec) - nowSec}s)`);
  }
  const cents = verdict.side === "up" ? context.upCents : context.downCents;
  if (cents === null) return hold(`${verdict.side} is not quoted at this stake: ${verdict.why}`);
  if (cents > rules.maxPriceCents) return hold(`${verdict.side} costs ${cents}¢, over the ${spec.posture} cap of ${rules.maxPriceCents}¢: ${verdict.why}`);
  return { side: verdict.side, moveBps: move, thresholdBps: 0, reason: `agent bets ${verdict.side} (${conf}): ${verdict.why}` };
}
