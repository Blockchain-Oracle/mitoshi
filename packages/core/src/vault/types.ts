// Ported from Masayume 68f7a09:packages/core/src/vault/types.ts — `VaultCaps.market` added (D-091), the forwarder
// dropped from `VaultDeployment` (D-003: our fee relay replaces the ERC-2771 forwarder).
import type { MarketId } from "../types/market";
import type { Address } from "../types/primitives";

/** The three delegated powers (AD-5), in the contract's enum order. */
/** `exit` (S24, D-193) is v2's sell-only grant for the exit keeper: no budget, sells only at the fair-value floor. */
export type GrantKind = "session" | "executor" | "strategy" | "exit";
export const GRANT_KINDS: readonly GrantKind[] = ["session", "executor", "strategy", "exit"];
export const GRANT_KIND_INDEX: Record<GrantKind, 0 | 1 | 2 | 3> = { session: 0, executor: 1, strategy: 2, exit: 3 };
/** The kinds a vault version knows (v1's enum stops at `strategy`; asking it for `exit` reverts). */
export const grantKindsOf = (version: 1 | 2): readonly GrantKind[] => (version === 2 ? GRANT_KINDS : GRANT_KINDS.slice(0, 3));

export function grantKindOf(index: number): GrantKind {
  const kind = GRANT_KINDS[index];
  if (!kind) throw new Error(`unknown grant kind ${index}`);
  return kind;
}

/**
 * Every cap in collateral base units except the position count; `maxPriceRaw` 0 means no limit. `market` scopes the
 * grant to one Window (D-091, `Caps.market`); null — the contract's zero — means any Window.
 */
export interface VaultCaps {
  maxStakePerTradeBase: bigint;
  maxDailySpendBase: bigint;
  maxOpenPositions: number;
  maxPriceRaw: bigint;
  market: MarketId | null;
}

export interface VaultGrant {
  grantId: bigint;
  owner: Address;
  actor: Address;
  kind: GrantKind;
  revoked: boolean;
  expiresAtSec: number;
  /** UTC day (`sec / 86400`) that `spentTodayBase` belongs to. */
  spentDay: number;
  spentTodayBase: bigint;
  openPositions: number;
  caps: VaultCaps;
  /** What the actor may still spend; proceeds never return here. */
  budgetBase: bigint;
}

export interface VaultAccount {
  availableBase: bigint;
  privateAvailableBase: bigint;
  totalDepositedBase: bigint;
  totalWithdrawnBase: bigint;
}

/** Where the vault lives on one chain — regenerated from `contracts/deployments` (AD-10). */
export interface VaultDeployment {
  chainId: number;
  eventVault: Address;
  collateral: Address;
  /** The block the vault was deployed in: where its event history starts. */
  fromBlock: bigint;
  /** 2: `EventVaultV2` (the EXIT grant, S24) — the current one where deployed; 1: the first, kept for what it still holds. */
  version: 1 | 2;
}

/** One reading of everything the Trading Balance surfaces show for a wallet. */
export interface VaultSnapshot {
  deployment: VaultDeployment;
  account: VaultAccount;
  /** The live grant per kind, or null — an owner holds at most one per kind. */
  grants: Record<GrantKind, VaultGrant | null>;
  decimals: number;
}

/** Outcome tokens the vault holds for the wallet on one Window, and which grant opened each side. */
export interface VaultHoldings {
  marketId: MarketId;
  upRaw: bigint;
  downRaw: bigint;
  upGrantId: bigint;
  downGrantId: bigint;
}

/** One Window the owner traded through the vault (S7): holdings now, the vault's own tally, and the Window. */
export interface VaultBet {
  /** The Trading Balance that holds it (S24.2: v1 positions stay in v1 until sold or settled). */
  vault: Address;
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  expirySec: number;
  lockAtSec: number;
  decimals: number;
  state: "open" | "resolved" | "voided";
  /** Held now (outcome raw units): zero once cranked or sold. */
  upRaw: bigint;
  downRaw: bigint;
  costBase: bigint;
  proceedsBase: bigint;
  payoutBase: bigint;
  /** 0 until the Window was cranked into the Trading Balance. */
  settledAtSec: number;
  lastAtSec: number;
}

export const VAULT_NOT_DEPLOYED = "EventVault is not deployed on this network yet" as const;
