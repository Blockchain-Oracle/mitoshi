// Ported from Masayume 68f7a09:packages/core/src/strategies/types.ts
import type { MarketId, OutcomeIdx, Side } from "../types/market";
import type { Address, Hex } from "../types/primitives";
import type { VaultCaps } from "../vault/types";

/** A creator's strategy expressed as DATA the fixed runner evaluates — never code (reference `StrategySpec`). */
export type PresetKey = "momentum" | "reversion" | "agent";

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

export type StrategySpec = OracleFollowSpec | AgentSpec;

/** What the registry holds on-chain for one strategy, decoded. */
export interface StrategyRecord {
  strategyId: bigint;
  creator: Address;
  runner: Address;
  specHash: Hex;
  /** The plain metadata string the creator published; `parseStrategyMetadata` reads it. */
  metadata: string;
  envelope: VaultCaps;
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

/** Registry writes: every one journals, simulates, sends and books through the same lane shape as a vault write. */
export type StrategyIntent =
  | { kind: "strategy-publish"; runner: Address; spec: StrategySpec; metadata: StrategyMetadata; envelope: VaultCaps; feeBase: bigint }
  | { kind: "strategy-update"; strategyId: bigint; spec: StrategySpec; metadata: StrategyMetadata; feeBase: bigint }
  | { kind: "strategy-subscribe"; strategyId: bigint; grantId: bigint; feeBase: bigint }
  | { kind: "strategy-unsubscribe"; strategyId: bigint }
  | { kind: "strategy-deactivate"; strategyId: bigint };

/** Where the registry lives on one chain — regenerated from `contracts/deployments` (AD-10). */
export interface RegistryDeployment {
  chainId: number;
  strategyRegistry: Address;
  fromBlock: bigint;
}

export const REGISTRY_NOT_DEPLOYED = "StrategyRegistry is not deployed on this network yet" as const;
