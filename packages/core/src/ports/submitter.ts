// Ported from Masayume 68f7a09:packages/core/src/ports/submitter.ts
import type { Diagnosis } from "../types/diagnosis";
import type { EventMarket, MarketId, OutcomeIdx, Side } from "../types/market";
import type { Address, Hex } from "../types/primitives";
import type { Quote } from "../types/trading";
import type { ExitQuote } from "./markets-provider";
import type { ArenaIntent } from "../games/arena";
import type { ParlayIntent } from "../parlay/types";
import type { RangeIntent } from "../range/types";
import type { MakerIntent } from "../maker/types";
import type { LeverageIntent } from "../leverage/types";
import type { PrivateIntent } from "../private/types";
import type { StrategyIntent } from "../strategies/types";
import type { GrantKind, VaultCaps } from "../vault/types";

/** The write-path state machine every surface renders (EXPERIENCE.md). */
export type WritePhase = "composing" | "submitted" | "confirming" | "confirmed" | "reverted" | "unknown";

export type PhaseListener = (phase: WritePhase, detail?: { txHash?: Hex }) => void;

/**
 * The order lane's third dimension (AD-3): the wallet signs its own venue order, or the same
 * intent goes through the EventVault — from the owner's Trading Balance, or from a grant's
 * budget by the grant's actor. One interface, neither route implemented twice.
 */
export type OrderRoute = { kind: "wallet" } | { kind: "vault" } | { kind: "vault-grant"; grantId: bigint };

export interface OrderRequest {
  market: EventMarket;
  side: Side;
  stakeBase: bigint;
  /** The quote the user confirmed; its `maxCostBase` is the cap — a fresh quote whose `maxCostBase` exceeds it is surfaced as a requote, never silently accepted. */
  displayedQuote: Quote;
  wallet: Address;
  /** Defaults to the wallet route. */
  route?: OrderRoute;
}

export interface BookedOrder {
  marketId: MarketId;
  side: Side;
  contractsRaw: bigint;
  costBase: bigint;
  avgPriceBps: number;
  txHash: Hex;
  fillCount: number;
}

export type OrderOutcome =
  | { status: "confirmed"; booked: BookedOrder }
  /** The tx mined but crossed nothing: the book moved before the IOC landed; the stake was never taken. */
  | { status: "nothingFilled"; txHash: Hex }
  /** The fresh quote's `maxCostBase` exceeds the confirmed one — the surface shows the new cost and asks again. */
  | { status: "requote"; quote: Quote }
  | { status: "refused"; diagnosis: Diagnosis }
  | { status: "reverted"; diagnosis: Diagnosis; txHash: Hex }
  | { status: "unknown"; diagnosis: Diagnosis; txHash?: Hex };

/** Sell a held side back into the book before lock (L-35, D-067): SELL IOC at the exit's protective limit. */
export interface CashOutRequest {
  market: EventMarket;
  side: Side;
  /** How many contracts to sell, at most the holding. */
  contractsRaw: bigint;
  /** The exit the user confirmed; its `minProceedsBase` is the floor. */
  displayedExit: ExitQuote;
  wallet: Address;
  /**
   * Where the position is held (S23d, D-197): the wallet (default, the engine lane) or the Trading Balance — `vault`
   * (the owner signs `place`) or `vault-grant` (the session key signs `placeFor`, sponsored). Sale proceeds land in
   * the owner's Trading Balance, never the actor's budget.
   */
  route?: OrderRoute;
}

/** What a sold side booked: contracts sold and the cash the fills paid (sent to the wallet with the same tx). */
export interface BookedSell {
  marketId: MarketId;
  side: Side;
  contractsRaw: bigint;
  proceedsBase: bigint;
  avgPriceBps: number;
  txHash: Hex;
  fillCount: number;
}

export type CashOutOutcome =
  | { status: "confirmed"; booked: BookedSell }
  | { status: "nothingFilled"; txHash: Hex }
  /** The fresh exit pays less than the confirmed floor: show it and ask again. */
  | { status: "requote"; exit: ExitQuote }
  | { status: "refused"; diagnosis: Diagnosis }
  | { status: "reverted"; diagnosis: Diagnosis; txHash: Hex }
  | { status: "unknown"; diagnosis: Diagnosis; txHash?: Hex };

export interface GrantTerms {
  kind: GrantKind;
  actor: Address;
  caps: VaultCaps;
  expiresAtSec: number;
  budgetBase: bigint;
}

/** EventVault writes: every one journals, simulates, sends and books through the same lane as a redeem. */
export type VaultIntent =
  | { kind: "vault-deposit"; amountBase: bigint }
  | { kind: "vault-withdraw"; amountBase: bigint }
  | { kind: "vault-move-private"; amountBase: bigint }
  | { kind: "vault-withdraw-private"; amountBase: bigint }
  | { kind: "vault-grant"; terms: GrantTerms }
  /** Deposit and grant in one transaction, so no grant ever exists without its budget (Story 6.1). */
  | { kind: "vault-deposit-and-grant"; amountBase: bigint; terms: GrantTerms }
  | { kind: "vault-fund-grant"; grantId: bigint; amountBase: bigint }
  /** Deposit from the wallet straight into a live grant's budget in one transaction ("Add to budget", S7). */
  | { kind: "vault-deposit-and-fund"; grantId: bigint; amountBase: bigint }
  | { kind: "vault-revoke"; grantId: bigint }
  /** Permissionless: anyone may crank a settled Window into its owner's balance. */
  | { kind: "vault-crank-settle"; owner: Address; marketId: MarketId }
  | { kind: "vault-sweep"; marketId: MarketId };

export type TxIntent =
  | { kind: "approve"; token: Address; spender: Address; amountBase: bigint }
  /**
   * Send a TIP-20 balance from the wallet to another address (S23g: the account drawer's Withdraw). Never sponsored —
   * the sender pays the fee in the token — and never through a one-tap key: money leaving the account always asks.
   */
  | { kind: "transfer"; token: Address; to: Address; amountBase: bigint }
  /** Redeem every settled lot the wallet holds on the market (engine `redeem(marketId)`; drains own orders first, T-deviation). */
  | { kind: "redeem"; marketId: MarketId }
  /** Redeem part of one side (engine `redeemPartial`). */
  | { kind: "redeem-partial"; marketId: MarketId; outcomeIdx: OutcomeIdx; amountRaw: bigint }
  /** Pay out engine credit for the listed markets (`withdrawCredit`). */
  | { kind: "withdraw-credit"; marketIds: MarketId[] }
  /**
   * Collect every leftover in one sponsored batch (D-048): `redeem` each settled Window still held and `withdrawCredit`
   * each Window with credit (a payout the receive policy held, cancel or eviction refunds). ≤ 8 calls per transaction.
   */
  | { kind: "claim-all"; redeem: MarketId[]; credits: { marketId: MarketId; amountBase: bigint }[] }
  /** Cancel resting orders on one Window (engine `cancelOrders`, ≤ 16 ids), escrow returned to the wallet. */
  | { kind: "cancel-orders"; marketId: MarketId; orderIds: bigint[] }
  /** Revoke TIP-1011 access keys on the AccountKeychain in one transaction (1–8; the `/settings/account` trust surface, D-053). */
  | { kind: "key-revoke"; keyIds: Address[] }
  /** The relay's S1 proof area: a harmless sponsored call that moves nothing (Multicall3 `getBlockNumber`). */
  | { kind: "noop" }
  | VaultIntent
  | StrategyIntent
  | ParlayIntent
  | RangeIntent
  | MakerIntent
  | LeverageIntent
  | PrivateIntent
  | ArenaIntent;

export function isVaultIntent(intent: TxIntent): intent is VaultIntent {
  return intent.kind.startsWith("vault-");
}

export function isStrategyIntent(intent: TxIntent): intent is StrategyIntent {
  return intent.kind.startsWith("strategy-");
}

export function isParlayIntent(intent: TxIntent): intent is ParlayIntent {
  return intent.kind.startsWith("parlay-");
}

export function isRangeIntent(intent: TxIntent): intent is RangeIntent {
  return intent.kind.startsWith("range-");
}

export function isMakerIntent(intent: TxIntent): intent is MakerIntent {
  return intent.kind.startsWith("maker-");
}

export function isLeverageIntent(intent: TxIntent): intent is LeverageIntent {
  return intent.kind.startsWith("leverage-");
}

export function isPrivateIntent(intent: TxIntent): intent is PrivateIntent {
  return intent.kind.startsWith("private-");
}

export function isArenaIntent(intent: TxIntent): intent is ArenaIntent {
  return intent.kind.startsWith("arena-");
}

export type TxOutcome =
  /** `txHashes`: every transaction of a multi-transaction intent (claim-all), in order; `txHash` is the last. */
  | { status: "confirmed"; txHash: Hex; txHashes?: Hex[] }
  | { status: "reverted"; diagnosis: Diagnosis; txHash?: Hex }
  | { status: "refused"; diagnosis: Diagnosis }
  | { status: "unknown"; diagnosis: Diagnosis; txHash?: Hex };

/** The ONE write pipeline, two lanes (AD-3). */
export interface Submitter {
  submitOrder(request: OrderRequest, onPhase?: PhaseListener): Promise<OrderOutcome>;
  submitTx(intent: TxIntent, onPhase?: PhaseListener): Promise<TxOutcome>;
  submitCashOut(request: CashOutRequest, onPhase?: PhaseListener): Promise<CashOutOutcome>;
  hasSigner(): boolean;
}

export type StopDecision = { ok: true; reservationId: string } | { ok: false; reason: string };

/** Daily-Stop gate — a mandatory pre-send step of the order lane; allow-all until Epic 5 (AD-9). */
export interface StopGate {
  checkAndReserve(wallet: Address, costBase: bigint): Promise<StopDecision>;
  reconcile(reservationId: string, bookedCostBase: bigint): Promise<void>;
}

export interface Attribution {
  builder?: Address;
  builderFeeBpsTimes1k?: bigint;
}

/** Builder-tag hook, no-op in v1 (AD-11). */
export type AttributionHook = (request: OrderRequest) => Attribution;

export type IntentState = "recorded" | "sent" | "confirmed" | "failed" | "unknown";

/**
 * How the tx was nonced: an expiring nonce (`nonceKey = maxUint256`, `validBefore` ≤ now + 300 s) decides "absent vs
 * pending" by expiry (L-08); a 2D lane for ordered streams; the protocol nonce for owner sends.
 */
export type NonceKind = "expiring" | "lane" | "protocol";

export interface IntentRecord {
  id: string;
  kind: TxIntent["kind"] | "order";
  wallet: Address;
  createdAtMs: number;
  state: IntentState;
  txHash?: Hex;
  summary: string;
  chainId: number;
  /** For an expiring nonce: no receipt after this second means "not included", never re-sent. Null otherwise. */
  validBeforeSec: number | null;
  nonceKind: NonceKind;
  /** Whether the relay was asked to pay the fee. */
  sponsored: boolean;
  /** The Window an order was aimed at — what a send with no digest is reconciled against. */
  marketId?: MarketId;
}

/** Intent is journaled before send so a no-digest timeout can be reconciled instead of retried (AD-3). */
export interface IntentJournal {
  record(entry: Omit<IntentRecord, "id" | "state" | "createdAtMs">): Promise<IntentRecord>;
  markSent(id: string, txHash: Hex): Promise<void>;
  markConfirmed(id: string): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
  markUnknown(id: string): Promise<void>;
  listUnresolved(wallet: Address): Promise<IntentRecord[]>;
}
