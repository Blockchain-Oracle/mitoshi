// Ported from Agari 03b30ab:web/src/features/strategies/protocol.ts (types only: the routes are ours and read the index,
// so no zod reaches the client bundle) — the strategy carries its ERC-8004 agent, series scope and feedback (S9).
/** Wire shapes of `/api/strategies` and `/api/strategies/mine`: base units travel as decimal strings, never floats. */
import type { AgentWindowOutcome, RunnerBeat, RunnerHealthKind, StrategySpec, SubscriptionMode } from "@cwf/core";

export interface EnvelopeWire {
  maxStakePerTradeBase: string;
  maxDailySpendBase: string;
  maxOpenPositions: number;
  maxPriceRaw: string;
  /** The series the strategy trades (every Window of it), or null for any Window. */
  series: string | null;
  seriesLabel: string | null;
}

/** One decision on one Window — an agent's read, or a rule's call (`model` "rule/<preset>", no confidence) — as the
 *  card shows it; the outcome is the Window's own settlement. */
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

export interface DecisionsWire {
  total: number;
  bets: number;
  held: number;
  failed: number;
  lastAtMs: number | null;
  recent: DecisionWire[];
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
  /** Copy trades placed for anyone (follow or fade) and the collateral they put to work — Q-001's inherited ranking. */
  copyTrades: number;
  entrustedBase: string;
}

export interface StrategyWire {
  strategyId: string;
  creator: string;
  runner: string;
  agentId: string | null;
  name: string;
  description: string;
  /** The metadata's portrait seed (R4-6); null: the app draws from `mitoshi-strategy:<id>`. */
  portraitSeed: string | null;
  /** Every subscription fee its copiers paid its creator, summed (base units; R4-6, the creator's desk). */
  feesEarnedBase: string;
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
  /** The runner's last pass: `why` is the ops log's line (never shown raw), `state` what it did as data (null before
   *  strategies/0005), which the app words (`features/agents/pulse`). */
  health: { kind: RunnerHealthKind; lastTickMs: number | null; intervalMs: number | null; why: string | null; state: RunnerBeat | null };
  /** An agent's model (its latest read's); null for a rule or a mirror. */
  agent: { model: string | null } | null;
  /** Every decision it has made (dry runs never), by ruling, when it last decided, and its latest few, newest first. */
  decisions: DecisionsWire;
  /** ERC-8004 feedback on its agent (non-revoked): how many, and their mean as a decimal string. */
  feedback: { count: number; mean: string | null };
  /** A sealed memory subscribers can read (L-56): its title and length only — the body is served by the gated routes.
   *  `readPriceBase`: one paid read over MPP for a non-copier (S9.9b), pathUSD base units; "0" when copiers only. */
  memory: { title: string; chars: number; readPriceBase: string; updatedAtMs: number } | null;
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

export interface SeriesWire {
  seriesId: string;
  label: string;
  symbol: string;
  cadenceSec: number;
}

export interface StrategiesPayload {
  deployed: boolean;
  /** The registry address (its explorer link). */
  registry: string | null;
  /** The house runner's key — what a strategy names to be run by the platform; null where none is configured. */
  houseRunner: string | null;
  /** What a strategy may be scoped to: every series the index knows. */
  series: SeriesWire[];
  /** Distinct wallets copying any strategy now (one wallet copying three counts once). */
  copiers: number;
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

/** One decision on the agent's page, with what it cost: its MPP receipts (null: unpaid — testnet reads, D-218.4). */
export interface DecisionDetailWire extends DecisionWire {
  receipts: { host: string; amountBase: string; currency: string; reference: string | null; atMs: number }[] | null;
}

/** `/api/strategies/[id]`: everything an agent's page shows beyond its card. */
export interface StrategyDetailPayload {
  strategy: StrategyWire;
  /** The runner's last passes for it, newest first. */
  heartbeats: { atMs: number; why: string; state: RunnerBeat | null }[];
  /** Its latest decisions, newest first (the count is `strategy.decisions.total`). */
  decisions: DecisionDetailWire[];
  fills: FillWire[];
  feedback: { client: string; value: string; valueDecimals: number; tag1: string; tag2: string; revoked: boolean; txHash: string; atSec: number }[];
  computedAtMs: number;
}

/** `/api/strategies/preview` (R4-6, the studio's test read): one real model call on a live Window, nothing sent. */
export interface AgentPreviewRequest {
  persona: string;
  posture: "guarded" | "balanced" | "active";
  cadences: number[];
  stakeBase: string;
}
export interface AgentPreviewResponse {
  market: { marketId: string; label: string; elapsedSec: number; leftSec: number; inSlot: boolean };
  read: { openingText: string; moveBps: number; upCents: number | null; downCents: number | null };
  verdict: { side: "up" | "down" | "hold"; confidence: number; why: string } | null;
  failure: string | null;
  gate: { side: "up" | "down" | null; reason: string };
  model: string;
}
