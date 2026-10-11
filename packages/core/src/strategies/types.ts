// Ported from Masayume 68f7a09:packages/core/src/strategies/types.ts
// + Agari 03b30ab:packages/core/src/strategies/types.ts (`MirrorSpec`, `sideForSubscriber`); S9 (D-218, D-219): the
// record carries the ERC-8004 agent id, the metadata hash and the envelope's series scope; a subscription is `follow`
// or `fade`; the intents gain the one-batch copy and stop.
import type { MarketId, OutcomeIdx, SeriesId, Side } from "../types/market";
import type { Address, Hex } from "../types/primitives";
import type { VaultCaps } from "../vault/types";

/** A creator's strategy expressed as DATA the fixed runner evaluates — never code (reference `StrategySpec`). */
export type PresetKey = "momentum" | "reversion" | "agent" | "mirror";

/** How hard the gate leans on an agent's call: the confidence floor, the price cap, the breaker. */
export type AgentPosture = "guarded" | "balanced" | "active";

/** The house model's data: how far back it reads and how big a move earns a bet. */
export interface OracleFollowSpec {
  preset: "momentum" | "reversion";
  /** How many recent price samples the runner reads (2–12). */
  lookback: number;
  /** The smallest move, in bps, worth a bet; below it the runner sits the round out. */
  thresholdBps: number;
}

/**
 * An agent's data: a persona a language model reads, a posture the gate enforces, the cadences it
 * may trade. No model name lives here — the model actually used is recorded per decision, so the
 * spec hash never pins a vendor string.
 */
export interface AgentSpec {
  preset: "agent";
  /** The creator's brief, 1–600 characters. Untrusted input to the prompt; never a rule the gate reads. */
  persona: string;
  posture: AgentPosture;
  /** Window cadences it may read, in seconds — unique, ascending, drawn from `AGENT_CADENCES_SEC`. */
  cadences: number[];
}

/**
 * Copy one named wallet (A-3b, D-218.9): the signal is that trader's own calls on the Window, as the index recorded
 * them. There is no model and no threshold here — the only judgement is whose calls to copy and how fresh one has to
 * be. Data, so the registry is unchanged.
 */
export interface MirrorSpec {
  preset: "mirror";
  /** The wallet whose calls this strategy copies. */
  trader: Address;
  /** How recently that wallet must have traded a Window for it to be worth copying, in seconds. */
  withinSec: number;
}

export type StrategySpec = OracleFollowSpec | AgentSpec | MirrorSpec;

/** A subscriber's consent: the runner's side (`follow`) or the other side (`fade`, A-1c) — the registry's `Mode`. */
export type SubscriptionMode = "follow" | "fade";

/** The registry's `Mode` enum, in order (0 FOLLOW, 1 FADE). */
export const SUBSCRIPTION_MODES = ["follow", "fade"] as const satisfies readonly SubscriptionMode[];

/**
 * The widest caps a subscriber's STRATEGY grant may carry. `series` scopes the strategy to every Window of one series
 * (null: any Window); the vault can only pin a grant to one Window or any, so the runner holds to the series (D-219).
 */
export interface StrategyEnvelope extends Omit<VaultCaps, "market"> {
  series: SeriesId | null;
}

/** What the registry holds on-chain for one strategy, decoded. */
export interface StrategyRecord {
  strategyId: bigint;
  creator: Address;
  runner: Address;
  specHash: Hex;
  /** The metadata the creator published (SSTORE2 bytes as UTF-8, "" when none); `parseStrategyMetadata` reads it. */
  metadata: string;
  /** keccak256 of the metadata bytes, null when none: a reader checks what it fetched against it. */
  metadataHash: Hex | null;
  /** The creator's ERC-8004 agent id (AG-1), null when the strategy names none. */
  agentId: bigint | null;
  envelope: StrategyEnvelope;
  feeBase: bigint;
  active: boolean;
  createdAtSec: number;
  subscribers: number;
  revision: number;
}

/** The creator's published words and spec, as carried in `StrategyRecord.metadata`. */
export interface StrategyMetadata {
  name: string;
  description: string;
  spec: StrategySpec;
  /** Plain text, stored by Masayume in the open. Nothing here is encrypted. */
  playbook?: string;
}

export interface StrategySubscription {
  strategyId: bigint;
  subscriber: Address;
  grantId: bigint;
  subscribedAtSec: number;
  /** Consent is on record. */
  active: boolean;
  /** Consent on record AND a live grant to the runner — what the runner may act on now. */
  live: boolean;
  /** Which way the subscriber consented to be copied (A-1c). */
  mode: SubscriptionMode;
}

/** One agent read per (strategy, Window): its id, which MPP receipts (`mpp_receipts.decision_id`) are scoped to. */
export function decisionIdOf(strategyId: bigint | string, marketId: string): string {
  return `${strategyId.toString()}:${marketId.toLowerCase()}`;
}

/** The side the runner actually sends for one subscriber: a fade turns the strategy's call around. */
export function sideForSubscriber(decided: Side, mode: SubscriptionMode): Side {
  return mode === "fade" ? (decided === "up" ? "down" : "up") : decided;
}

/** One fill the runner executed for a subscriber, as the runner recorded it. */
export interface StrategyFill {
  txHash: Hex;
  strategyId: bigint;
  grantId: bigint;
  owner: Address;
  marketId: MarketId;
  side: Side;
  cashDeltaBase: bigint;
  tokenDeltaRaw: bigint;
  atSec: number;
  dryRun: boolean;
  /** The subscriber's consent the side came from; a fade's `side` is the strategy's call turned around. */
  mode: SubscriptionMode;
}

/** The settlement facts a fill needs to be scored. */
export interface FillSettlement {
  settled: boolean;
  voided: boolean;
  winningOutcome: OutcomeIdx | null;
}

export type RunnerHealthKind = "never-started" | "alive" | "stale" | "unknown";

export interface RunnerHealth {
  kind: RunnerHealthKind;
  lastTickMs: number | null;
  intervalMs: number | null;
  /** The runner's own words for its last cycle, or null before it has ever spoken. */
  why: string | null;
}

/** The runner's decision for one Window — the model contract's envelope (reference plan §Model contract). */
export interface Decision {
  side: Side | null;
  moveBps: number;
  thresholdBps: number;
  reason: string;
}

/**
 * Registry writes: every one journals, simulates, sends and books through the same lane shape as a vault write.
 * `strategy-copy` is one transaction (D-219): a STRATEGY grant to the runner (with a deposit when the Trading Balance is
 * short), an exact approval of the fee, and `subscribe(id, 0, mode, maxFee)` reading that grant; self-paid, since the
 * relay never sponsors `grant` (D-218.2). `strategy-stop` revokes the grant and ends the consent in one sponsored
 * transaction (an exit).
 */
export type StrategyIntent =
  | { kind: "strategy-publish"; runner: Address; spec: StrategySpec; metadata: StrategyMetadata; envelope: StrategyEnvelope; feeBase: bigint; agentId: bigint | null }
  | { kind: "strategy-update"; strategyId: bigint; spec: StrategySpec; metadata: StrategyMetadata; feeBase: bigint }
  | {
      kind: "strategy-copy";
      strategyId: bigint;
      runner: Address;
      caps: VaultCaps;
      expiresAtSec: number;
      budgetBase: bigint;
      /** Moved from the wallet into the Trading Balance first; 0n when the balance already covers the budget. */
      depositBase: bigint;
      mode: SubscriptionMode;
      /** The most the subscriber agreed to pay; the registry refuses a higher fee (`FeeAboveMax`). */
      maxFeeBase: bigint;
      /**
       * The wallet's other subscriptions on the same runner, re-pointed onto the new grant in the same transaction (a
       * new STRATEGY grant revokes the old one, so they would otherwise stop). No fee: each is already subscribed. Also
       * how "resume" is sent after a pause.
       */
      carry?: { strategyId: bigint; mode: SubscriptionMode }[];
    }
  /** Re-subscribe while subscribed: move onto another grant or switch follow ↔ fade; no fee (D-219.3). */
  | { kind: "strategy-subscribe"; strategyId: bigint; grantId: bigint; mode: SubscriptionMode; maxFeeBase: bigint }
  /** Revoke the grant, keep the consent: the runner stops; resuming is a `strategy-copy` with no fee (D-219.3). */
  | { kind: "strategy-pause"; strategyId: bigint; grantId: bigint }
  | { kind: "strategy-stop"; strategyId: bigint; grantId: bigint }
  | { kind: "strategy-unsubscribe"; strategyId: bigint }
  | { kind: "strategy-deactivate"; strategyId: bigint };

/** Where the registry lives on one chain — regenerated from `contracts/deployments` (AD-10). */
export interface RegistryDeployment {
  chainId: number;
  strategyRegistry: Address;
  fromBlock: bigint;
}

export const REGISTRY_NOT_DEPLOYED = "StrategyRegistry is not deployed on this network yet" as const;
