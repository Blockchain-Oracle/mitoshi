// Ported from Masayume 68f7a09:packages/core/src/ports/markets-provider.ts
import type { WalletHistory } from "../projection/types";
import type { Reading } from "../schemas/reading";
import type { AssetPrice, ClockSync, PricePoint, Resolution } from "../types/feeds";
import type { EventMarket, LaneSet, MarketId, OnchainSnapshot, SeriesId, Side } from "../types/market";
import type { Address } from "../types/primitives";
import type { BalanceSheet, BookDepth, BookParams, ClaimableRow, Holdings, OpenPosition, Quote } from "../types/trading";
import type { VaultBet, VaultHoldings, VaultSnapshot } from "../vault/types";

/** What a book read needs to address a market: one engine, so the id alone (plan C.2.1). */
export interface BookTarget {
  marketId: MarketId;
  decimals: number;
}

export interface QuoteTarget extends BookTarget {
  intervalSec: number;
}

/** A quote to exit a held position: sell `contractsRaw` of `side` into the book now (D-067). */
export interface ExitQuote {
  side: Side;
  contractsRaw: bigint;
  /** What the walk pays right now for the fillable size. */
  proceedsBase: bigint;
  /** The floor at the protective limit: the least a fill can pay (a fresh exit below the confirmed floor is a requote). */
  minProceedsBase: bigint;
  /** Protective limit in the side's own ticks for the SELL IOC. */
  limitPriceTicks: number;
  fillableContractsRaw: bigint;
  partial: boolean;
  quotedAtMs: number;
}

/** The verdict card's state (D-048), shaped by `@cwf/markets` `pinVerdict`. */
export interface PinnedVerdictView {
  phase: "call" | "settling" | "stamped" | "paid" | "held";
  verdict: import("../types/trading").Verdict | null;
  paidBy: "auto" | "self" | null;
  paidBase: bigint | null;
  txHash: `0x${string}` | null;
  /** Where the payout lands: the wallet (engine), or the Trading Balance (a vault call cranked by `crankSettle`, S7). */
  into?: "wallet" | "trading-balance";
}

/** The ONE chain port for reads (AD-1). Every method returns a `Reading<T>`; nothing here throws for a chain failure. */
export interface MarketsProvider {
  listLiveLanes(): Promise<Reading<LaneSet>>;
  getMarket(marketId: MarketId): Promise<Reading<EventMarket | null>>;
  listSettled(limit?: number): Promise<Reading<EventMarket[]>>;
  getOnchain(marketId: MarketId): Promise<Reading<OnchainSnapshot>>;
  getBookDepth(target: BookTarget, depth?: number): Promise<Reading<BookDepth>>;
  /** The Series grid (lot, tick, minimum) — persisted-read allowlisted: it never changes for a Series. */
  getBookParams(seriesId: SeriesId): Promise<Reading<BookParams>>;
  /** Watch-free quote straight off the chain book — what the Submitter re-quotes with at click time. */
  freshQuoteStake(target: QuoteTarget, side: Side, stakeBase: bigint): Promise<Reading<Quote | null>>;
  /** Watch-free exit quote for a cash-out (SELL IOC) off fresh levels (D-067). */
  freshExitQuote(target: BookTarget, side: Side, contractsRaw: bigint): Promise<Reading<ExitQuote | null>>;
  getOpeningPrice(marketId: MarketId): Promise<Reading<bigint | null>>;
  getAssetPrice(asset: string): Promise<Reading<AssetPrice | null>>;
  getPriceHistory(asset: string, fromSec: number, toSec: number): Promise<Reading<PricePoint[]>>;
  settlementFeeBps(marketId: MarketId): Promise<Reading<number>>;
  listOpenPositions(wallet: Address): Promise<Reading<OpenPosition[]>>;
  getHoldings(wallet: Address, onchain: OnchainSnapshot): Promise<Reading<Holdings>>;
  listClaimables(wallet: Address): Promise<Reading<ClaimableRow[]>>;
  /** Every settled Window for a wallet, replayed from its fills — the one derivation history, PnL and Trader Edge share. */
  listWalletHistory(wallet: Address): Promise<Reading<WalletHistory>>;
  getBalanceSheet(wallet: Address): Promise<Reading<BalanceSheet>>;
  /**
   * The verdict pinned to the wallet's own position on one Window (D-048): call → settling → stamped → paid (auto or
   * collected) / held by the receive policy. Null when the wallet never held anything there.
   */
  getPinnedVerdict(wallet: Address, marketId: MarketId): Promise<Reading<PinnedVerdictView | null>>;
  syncClock(): Promise<Reading<ClockSync>>;
  /** Chain-offset-corrected wall clock; raw device time never drives a phase. */
  nowMs(): number;
  nextWindow(market: EventMarket): Promise<Reading<EventMarket | null>>;
  getResolution(marketId: MarketId): Promise<Reading<Resolution>>;
  /** The Trading Balance and its live grants; `null` on a network with no EventVault deployment. */
  getVaultSnapshot(wallet: Address): Promise<Reading<VaultSnapshot | null>>;
  /** What the vault holds for the wallet on one Window; zeros (not an error) when there is no vault. */
  getVaultHoldings(wallet: Address, onchain: OnchainSnapshot): Promise<Reading<VaultHoldings>>;
  /** The owner's recent Windows traded through the Trading Balance, newest first; empty without a vault (S7). */
  listVaultBets(wallet: Address): Promise<Reading<VaultBet[]>>;
}
