// Ported from Agari 03b30ab:web/src/features/strategies/protocol.ts (types only: the routes are ours and read the index,
// so no zod reaches the client bundle) — the strategy carries its ERC-8004 agent, series scope and feedback (S9).
/** Wire shapes of `/api/strategies` and `/api/strategies/mine`: base units travel as decimal strings, never floats. */
import type { AgentWindowOutcome, RunnerHealthKind, StrategySpec, SubscriptionMode } from "@cwf/core";

export interface EnvelopeWire {
  maxStakePerTradeBase: string;
  maxDailySpendBase: string;
  maxOpenPositions: number;
  maxPriceRaw: string;
  /** The series the strategy trades (every Window of it), or null for any Window. */
  series: string | null;
  seriesLabel: string | null;
}

/** One Window an agent read, as the card shows it; the outcome is the Window's own settlement. */
export interface DecisionWire {
  marketId: string;
  decidedAtMs: number;
  verdictSide: "up" | "down" | "hold" | "none";
  confidence: number | null;
  why: string;
  gate: "trade" | "held" | "failed" | "pending";
  gateReason: string;
  side: "up" | "down" | null;
  filled: number;
  model: string;
  label: string | null;
  outcome: AgentWindowOutcome | null;
}

export interface RecordWire {
  fills: number;
  settled: number;
  wins: number;
  losses: number;
  voids: number;
  netBase: string;
  stakedBase: string;
  curve: { atSec: number; cumBase: string }[];
  lastActiveSec: number;
  distinctSubscribers: number;
  /** Fills still waiting on their Window. */
  open: number;
}

export interface StrategyWire {
  strategyId: string;
  creator: string;
  runner: string;
  agentId: string | null;
  name: string;
  description: string;
  /** Null when the published metadata carries no readable spec (shown, never guessed). */
  spec: StrategySpec | null;
  specText: string | null;
  envelope: EnvelopeWire;
  feeBase: string;
  active: boolean;
  subscribers: number;
  createdAtSec: number;
  revision: number;
  /** The record of its own calls (follow fills); fades are the subscribers' bets against it. */
  record: RecordWire;
  health: { kind: RunnerHealthKind; lastTickMs: number | null; intervalMs: number | null; why: string | null };
  agent: { model: string | null; decisions: DecisionWire[] } | null;
  /** ERC-8004 feedback on its agent (non-revoked): how many, and their mean as a decimal string. */
  feedback: { count: number; mean: string | null };
}

export interface FillWire {
  txHash: string;
  strategyId: string;
  owner: string;
  marketId: string;
  label: string | null;
  side: "up" | "down";
  mode: SubscriptionMode;
  cashDeltaBase: string;
  tokenDeltaRaw: string;
  atSec: number;
  settled: boolean;
  pnlBase: string | null;
}

export interface StrategiesPayload {
  deployed: boolean;
  /** The registry address (its explorer link). */
  registry: string | null;
  strategies: StrategyWire[];
  fills: FillWire[];
  computedAtMs: number;
}

/** One wallet's consents and its own copy fills (the copier's P&L panel reads these). */
export interface MinePayload {
  subscriptions: { strategyId: string; grantId: string; mode: SubscriptionMode; active: boolean; feesPaidBase: string; subscribedAtSec: number }[];
  fills: FillWire[];
  computedAtMs: number;
}
