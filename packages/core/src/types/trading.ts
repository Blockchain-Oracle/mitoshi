// Ported from Masayume 68f7a09:packages/core/src/types/trading.ts
import type { MarketId, OutcomeIdx, Side } from "./market";

export interface BookLevelView {
  priceRaw: bigint;
  priceBps: number;
  quantityRaw: bigint;
}

/** Order book in UP/DOWN terms. Prices are in each side's own terms so both columns read as "what you pay". */
export interface BookDepth {
  upBids: BookLevelView[];
  upAsks: BookLevelView[];
  downBids: BookLevelView[];
  downAsks: BookLevelView[];
  decimals: number;
}

export interface BookParams {
  tickSizeRaw: bigint;
  lotSizeRaw: bigint;
  minQuantityRaw: bigint;
}

export interface Quote {
  side: Side;
  stakeBase: bigint;
  contractsRaw: bigint;
  /** What the book would charge right now for the whole size. */
  expectedCostBase: bigint;
  /** Escrow locked at the protective limit — the most a fill can ever cost. */
  maxCostBase: bigint;
  /** Protective limit in UP (YES) terms, ready for the order lane. */
  limitPriceRaw: bigint;
  avgPriceBps: number;
  oddsCents: number;
  payoutIfRightBase: bigint;
  /** How much of the stake the book can actually fill; equals `stakeBase` when not partial. */
  fillableStakeBase: bigint;
  partial: boolean;
  feeBps: number;
  decimals: number;
  quotedAtMs: number;
}

export interface OpenPosition {
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  expirySec: number;
  decimals: number;
  balanceUpRaw: bigint;
  balanceDownRaw: bigint;
  costBasisBase: bigint;
  avgCostRaw: bigint;
  markValueBase: bigint;
  unrealizedPnlBase: bigint;
  realizedPnlBase: bigint;
}

export interface Holdings {
  upRaw: bigint;
  downRaw: bigint;
}

/** `credit`: engine credit waiting on a Window (a payout held for a receive policy, cancel or eviction refunds). */
export type ClaimKind = "win" | "void" | "vault-credit" | "credit";

export interface ClaimLeg {
  outcomeIdx: OutcomeIdx;
  amountRaw: bigint;
  payoutBase: bigint;
}

export interface ClaimableRow {
  kind: ClaimKind;
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  expirySec: number;
  legs: ClaimLeg[];
  netPayoutBase: bigint;
  feeBps: number;
  decimals: number;
  settledAtMs: number | null;
  /** Engine credit on this Window, included in `netPayoutBase` (a redeem pays it with the payout). */
  creditBase?: bigint;
  /**
   * The wallet's TIP-403 receive policy refuses payments from the engine right now: the settler held this payout as
   * credit, and a claim would revert `ReceivePolicyBlocked`. Shown as "Held by your receive policy", never claimed.
   */
  heldByReceivePolicy?: boolean;
}

/** Credit the engine holds for the wallet on one market (paid out by `withdrawCredit`). */
export interface EngineCredit {
  marketId: MarketId;
  amountBase: bigint;
}

export interface BalanceSheet {
  decimals: number;
  /** pathUSD in the wallet (Tempo has no gas token: this is also what pays an unsponsored fee). */
  spendableBase: bigint;
  /** Cash locked behind resting orders (`Position.lockedCash`). */
  orderEscrowBase: bigint;
  engineCreditBase: bigint;
  engineCreditByMarket: EngineCredit[];
  /** `EventVault.accountOf`; null on a network with no EventVault deployment (S7). */
  vaultBase: bigint | null;
}

export type VerdictOutcome = "win" | "loss" | "void";

export interface Verdict {
  marketId: MarketId;
  outcome: VerdictOutcome;
  /** Payout − cost basis when the entry cost is on record; otherwise the payout alone (see `costBasisBase`). */
  pnlBase: bigint;
  payoutBase: bigint;
  /** null when no entry cost is on record — the figure then reads as a payout, not a P&L. */
  costBasisBase: bigint | null;
  /** Every side the wallet held, a losing leg included at payout 0 — one card, both legs (FR-10). */
  legs: ClaimLeg[];
  feeBps: number;
  decimals: number;
  settledAtMs: number | null;
}
