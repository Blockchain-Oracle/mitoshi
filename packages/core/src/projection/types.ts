// Ported from Masayume 68f7a09:packages/core/src/projection/types.ts
import type { MarketId, OutcomeIdx } from "../types/market";
import type { Address, Hex } from "../types/primitives";
import type { ClaimLeg, VerdictOutcome } from "../types/trading";

/** Where a round's fills came from: the wallet's own orders, or the EventVault trading for it. */
export type LedgerSource = "wallet" | "vault";

/** The venue's four order sides as the indexer names them — YES is UP, NO is DOWN. */
export type LedgerSide = "BUY_YES" | "SELL_YES" | "BUY_NO" | "SELL_NO";

/** One fill seen from the wallet's own seat: the side it was on, the quantity, the YES-terms price. */
export interface LedgerFill {
  marketId: MarketId;
  side: LedgerSide;
  quantityRaw: bigint;
  /** Execution price in YES (UP) terms; a NO leg costs the complement (canon #20). */
  yesPriceRaw: bigint;
  atMs: number;
  txHash: Hex;
}

/** A complete-set mint or merge through the router — it touches both outcomes at once. */
export interface LedgerSetAction {
  marketId: MarketId;
  kind: "mint" | "merge";
  amountRaw: bigint;
  atMs: number;
  txHash: Hex;
}

/** Everything a wallet did in one Window, replayed in order: what it holds now and what it paid and received. */
export interface MarketLedger {
  marketId: MarketId;
  heldUpRaw: bigint;
  heldDownRaw: bigint;
  /** Collateral paid for everything bought here, including the complement leg a short creates. */
  costBase: bigint;
  /** Collateral received from sells and merges before settlement. */
  proceedsBase: bigint;
  /** Which sides the wallet ever bought — the words on a row that closed out before expiry. */
  sidesTraded: OutcomeIdx[];
  fillCount: number;
  /** Fills that sold beyond inventory — a collateral-backed short, booked as a buy of the complement. */
  shortCount: number;
  firstAtMs: number;
  lastAtMs: number;
  entryTxHash: Hex;
  /** Whose seat the fills sat in: the wallet's own venue orders, or the vault trading for it. */
  source?: LedgerSource;
}

/** `closed` — nothing was held at expiry; the round's whole result was realised on the book. */
export type RoundOutcome = VerdictOutcome | "closed";

/**
 * Whether a settled payout has reached the wallet. `unknown` is a valid state: the live balance
 * could not be read, and guessing "paid" would hide money still waiting to be claimed.
 */
export type ClaimState = "paid" | "to-collect" | "none" | "unknown";

/** The settlement facts a round needs from its market row. */
export interface RoundMarket {
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  expirySec: number;
  decimals: number;
  settled: boolean;
  voided: boolean;
  winningOutcome: OutcomeIdx | null;
  resolvedAtMs: number | null;
}

/** One settled Window for one wallet, with every figure traceable to fills and the settlement rule. */
export interface SettledRound {
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  expirySec: number;
  decimals: number;
  outcome: RoundOutcome;
  /** What was held at expiry, per side, with its payout — a losing leg listed at 0, never dropped. */
  legs: ClaimLeg[];
  sidesTraded: OutcomeIdx[];
  /** Everything paid in. */
  stakeBase: bigint;
  /** Everything taken out on the book before expiry. */
  proceedsBase: bigint;
  /** What settlement pays for the held legs, net of the settlement fee. */
  payoutBase: bigint;
  /** The settlement fee skimmed from winning legs. */
  feeBase: bigint;
  /** proceeds + payout − stake. */
  pnlBase: bigint;
  feeBps: number;
  claim: ClaimState;
  /** Whose seat the round was traded from; vault rounds link no single transaction. */
  source: LedgerSource;
  settledAtMs: number | null;
  openedAtMs: number;
  entryTxHash: Hex;
  fillCount: number;
  shortCount: number;
}

/** A wallet's complete projection: settled rounds newest first, plus what is still open. */
export interface WalletHistory {
  rounds: SettledRound[];
  openCount: number;
  fillCount: number;
  /** False when a paging cap was hit — the figures then cover a prefix of the history and say so. */
  complete: boolean;
  decimals: number;
}

export interface TraderRanking {
  owner: Address;
  pnlBase: bigint;
  /** Net over stake in basis points; null when nothing was staked. */
  roiBps: number | null;
  winRatePct: number;
  /** Rounds closed inside the window — the "calls" a rank is built from. */
  tradeCount: number;
  /** Rounds decided by settlement (win or loss), the streak's domain. */
  settledTrades: number;
  bestStreak: number;
  volumeBase: bigint;
}
