// Ported from Masayume 68f7a09:packages/core/src/types/market.ts, with Agari 03b30ab:packages/core/src/types/market.ts
// (lanes, lock, policy, void reasons), reshaped for the Tempo engine per plan C.2.1 (docs/specs/engine.md A.1).
import { isBytes32, type Address, type Bytes32 } from "./primitives";

declare const marketIdBrand: unique symbol;

/**
 * A Window's identity everywhere off-chain: `keccak256(abi.encode(seriesId, uint64 index))` (engine A.1.1). Never a
 * book, pool or recycled slot (NFR-3). One venue, so no `venueId`.
 */
export type MarketId = Bytes32 & { readonly [marketIdBrand]: true };

export const isMarketId = (v: unknown): v is MarketId => isBytes32(v);

export function toMarketId(value: string): MarketId {
  const lower = value.toLowerCase();
  if (!isBytes32(lower)) throw new Error(`not a bytes32 market id: ${value}`);
  return lower as MarketId;
}

/** `keccak256(abi.encode(uint16 ticker, uint32 cadenceSec, uint8 basis))` (engine A.1.1). */
export type SeriesId = Bytes32;

export type Side = "up" | "down";
export type OutcomeIdx = 0 | 1;

export const SIDE_TO_OUTCOME: Record<Side, OutcomeIdx> = { up: 0, down: 1 };
export const OUTCOME_TO_SIDE: Record<OutcomeIdx, Side> = { 0: "up", 1: "down" };

/**
 * A Series' basis (the engine's `uint8 basis`; the index is the on-chain number):
 * - `regular`: in-session stock Windows on the ET clock, signed prints at exact T;
 * - `gap`: one "Monday Gap" per weekend, Friday close → next session open (locks Sunday 20:00 ET);
 * - `crypto24`: 24/7 crypto Windows (BTC, ETH, SOL);
 * - `stock24`: 24/7 stock Windows on the provider's 24/7 feed (labelled, Q-007).
 */
export type LaneBasis = "regular" | "gap" | "crypto24" | "stock24";
export const LANE_BASES: readonly LaneBasis[] = ["regular", "gap", "crypto24", "stock24"];
export const laneBasisOf = (basis: number): LaneBasis | null => LANE_BASES[basis] ?? null;
export const basisNumber = (basis: LaneBasis): number => LANE_BASES.indexOf(basis);
/** Lanes that run around the clock, with no NYSE session behind them. */
export const isAllHoursLane = (basis: LaneBasis): boolean => basis === "crypto24" || basis === "stock24";

/** The Gap lane's nominal cadence: one Window a week. The Window's own span varies with holidays. */
export const GAP_CADENCE_SEC = 604_800;

/** Which signed source recorded a print (engine `Print.source`: RedStone 2, Attested 4, DataStreams 5). */
export type PrintSource = "redstone" | "datastreams" | "attested";
export const PRINT_SOURCE_NUMBER: Record<PrintSource, number> = { redstone: 2, attested: 4, datastreams: 5 };
export function printSourceOf(n: number): PrintSource | null {
  return n === 2 ? "redstone" : n === 4 ? "attested" : n === 5 ? "datastreams" : null;
}

/** Why a Window voided at ½/½ instead of paying Up or Down (engine `Market.voidReason`). */
export type VoidReason = "missing-print" | "cross-check-divergence";

/**
 * The engine's stored terminal `state` (A.1.2). A stored terminal state wins over the clock; before it, the status is
 * derived from the clock by `statusOf`.
 */
export type MarketState = "open" | "resolved" | "voided";

/**
 * The status every surface derives from, in DreamDEX numbering on chain (Listed 0 / Trading 1 / Locked 2 / Resolved 4 /
 * Voided 5) plus `AwaitingClose` off chain: past expiry, closing print not yet recorded.
 */
export type MarketStatus = "Listed" | "Trading" | "Locked" | "AwaitingClose" | "Resolved" | "Voided";

/** Indexer lifecycle status — event-derived, so it lags the clock (canon #1). Kept for projections. */
export type IndexedStatus = "Listed" | "Trading" | "Locked" | "Settling" | "Resolved" | "Voided" | "Finalized";

/** One Window of one Series on the engine. */
export interface EventMarket {
  marketId: MarketId;
  seriesId: SeriesId;
  /** The Window's index within its Series (`uint64 index`). */
  index: bigint;
  /** The ticker symbol (`TickerSymbol` for listed names; kept a string so projections can carry unknown rows). */
  asset: string;
  lane: LaneBasis;
  question: string;
  /** The Series cadence: 300 / 900 / 3,600, or `GAP_CADENCE_SEC` on the Gap lane. */
  intervalSec: number;
  tradingStartSec: number;
  /** Trading stops here: equal to `expirySec` except on the Gap lane, which locks Sunday 20:00 ET. */
  lockAtSec: number;
  /** The closing print's boundary T. */
  expirySec: number;
  /** The frozen price-policy version both prints must come from. */
  policyVersion: number;
  /** The policy's primary source; null when neither the opening print nor the Series policy was read. */
  printSource: PrintSource | null;
  /** The check source was missing for a print (engine flag `SINGLE_SOURCE`). */
  singleSource: boolean;
  state: MarketState;
  /** Indexer view of the lifecycle, for history rows; never gates a write. */
  status: IndexedStatus;
  collateral: Address;
  decimals: number;
  winningOutcome: OutcomeIdx | null;
  voidReason: VoidReason | null;
  /** The opening print normalized to 1e-8; null until recorded. */
  openingPriceRaw: bigint | null;
  volumeQuoteRaw: bigint;
  tradeCount: number;
  /** Last trade price in ticks (engine `lastPrice`); null before the first trade. */
  lastPriceTicks: number | null;
  resolvedAtMs: number | null;
}

/** The clock-derived status (C.2.1). A stored terminal state wins; otherwise the times decide. */
export function statusOf(market: Pick<EventMarket, "state" | "tradingStartSec" | "lockAtSec" | "expirySec">, nowSec: number): MarketStatus {
  if (market.state === "voided") return "Voided";
  if (market.state === "resolved") return "Resolved";
  if (nowSec < market.tradingStartSec) return "Listed";
  if (nowSec < market.lockAtSec) return "Trading";
  if (nowSec < market.expirySec) return "Locked";
  return "AwaitingClose";
}

/** DreamDEX numbering of a status on chain (AwaitingClose reads as Locked there). */
export const STATUS_NUMBER: Record<MarketStatus, number> = { Listed: 0, Trading: 1, Locked: 2, AwaitingClose: 2, Resolved: 4, Voided: 5 };

/** One recorded print (engine `Print`), in 1e-8. */
export interface PrintView {
  priceE8: bigint;
  sourceTsSec: number;
  source: PrintSource | null;
  signers: number;
}

/** Head-fresh chain view of one market from the lens; the only source that may gate a write (canon #1). */
export interface OnchainSnapshot {
  marketId: MarketId;
  state: MarketState;
  /** The derived status number the lens reports (DreamDEX numbering). */
  status: number;
  tradingStartSec: number;
  lockAtSec: number;
  expirySec: number;
  prints: { open: PrintView | null; close: PrintView | null; checkOpen: PrintView | null; checkClose: PrintView | null };
  /** Payout per lot in cash units for YES and NO once resolved (both ½ on a void); null before. */
  payouts: { yes: bigint; no: bigint } | null;
  lastPriceTicks: number | null;
  /** The market's event sequence (`eventSeq`), for gap detection against the stream. */
  seq: bigint;
  decimals: number;
  winningOutcome: OutcomeIdx | null;
}

export interface Lane {
  basis: LaneBasis;
  intervalSec: number;
  label: string;
  markets: EventMarket[];
  /** Estimated next window start when the lane is between rounds; null when unknown. */
  nextStartSec: number | null;
}

export interface LaneSet {
  lanes: Lane[];
}
