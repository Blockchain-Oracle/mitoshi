// Ported from Masayume 68f7a09:packages/core/src/range/types.ts
import type { MarketId } from "../types/market";
import type { Address } from "../types/primitives";

/** The round's states, in the contract's enum order. */
export type RangeRoundStatus = "live" | "won" | "lost" | "void" | "claimed";
export const RANGE_ROUND_STATUSES: readonly RangeRoundStatus[] = ["live", "won", "lost", "void", "claimed"];

/** INSIDE wins when the closing print lands in `[low, high]`; OUTSIDE when it does not. Contract enum order. */
export type RangeSide = "inside" | "outside";
export const RANGE_SIDES: readonly RangeSide[] = ["inside", "outside"];

export function rangeStatusOf(index: number): RangeRoundStatus {
  const status = RANGE_ROUND_STATUSES[index];
  if (!status) throw new Error(`unknown range status ${index}`);
  return status;
}

export function rangeSideOf(index: number): RangeSide {
  const side = RANGE_SIDES[index];
  if (!side) throw new Error(`unknown range side ${index}`);
  return side;
}

export function rangeSideIndex(side: RangeSide): number {
  return RANGE_SIDES.indexOf(side);
}

/** What the contract read off the venue and the hub for one open — the basis a slip can show. */
export interface RangeBasis {
  /** P(close ≥ open) off the Window's book at open, × 1e6. */
  centerQE6: number;
  /** The house's per-√second volatility for the asset, × 1e8. */
  sigmaE8: number;
  tauSec: number;
}

export interface RangeRound {
  roundId: bigint;
  owner: Address;
  status: RangeRoundStatus;
  side: RangeSide;
  marketId: MarketId;
  expirySec: number;
  openedAtSec: number;
  settledAtSec: number | null;
  /** Prints in the oracle's scale (cents). `closingPrint` is null until settled. */
  openingPrint: bigint;
  lowPrint: bigint;
  highPrint: bigint;
  closingPrint: bigint | null;
  stakeBase: bigint;
  maxPayoutBase: bigint;
  /** `maxPayout − stake`: the reserve's part of the escrow. */
  houseLockedBase: bigint;
  /** The fair win probability the contract priced the round at, per whole unit of collateral. */
  probRaw: bigint;
}

export interface RangeParams {
  marginBps: number;
  maxExposureBps: number;
  maxSpreadRaw: bigint;
  centerDepthRaw: bigint;
  minCenterQE6: number;
  maxCenterQE6: number;
  minProbRaw: bigint;
  maxProbRaw: bigint;
  minTimeLeftSec: number;
  maxHorizonSec: number;
  staleAfterSec: number;
  maxPayoutCapBase: bigint;
  maxExpiryLockedBase: bigint;
  /** D-109: the centre is read over orders rested at least max(the Series' `minRestSec`, this). */
  minRestSec: number;
  /** PD-2/D-119 (D-172): the most the book's centre may sit from a same-call signed spot, in σ × 1e4 (two-sided). */
  maxDriftE4: number;
}

/** Where the reserve lives on one chain — regenerated from `contracts/deployments` (AD-10). */
export interface RangeDeployment {
  chainId: number;
  rangeReserve: Address;
  fromBlock: bigint;
}

/** The reserve's own balance sheet: what it can front, what it has fronted, and its tunables. */
export interface RangeReserveState {
  deployment: RangeDeployment;
  params: RangeParams;
  liquidBase: bigint;
  lockedBase: bigint;
  totalValueBase: bigint;
  utilizationBps: number;
  supplyShares: bigint;
  paused: boolean;
  decimals: number;
}

export type RangeMode = { kind: "fixStake"; stakeBase: bigint } | { kind: "fixPayout"; maxPayoutBase: bigint };

/** One priced band, every figure the contract's own (`previewOpen`) or derived from it without a float. */
export interface RangeQuote {
  side: RangeSide;
  /** P(inside) × 1e6 before the side is chosen. */
  insideProbE6: bigint;
  /** The priced side's fair probability, per whole unit of collateral. */
  probRaw: bigint;
  stakeBase: bigint;
  maxPayoutBase: bigint;
  /** `maxPayout / stake`, in thousandths — the "×N" the ticket headlines. */
  multiplierMilli: number;
  decimals: number;
  quotedAtMs: number;
}

export type RangeRefusal =
  | { kind: "band"; lowPrint: bigint; highPrint: bigint }
  | { kind: "long-shot"; probRaw: bigint; minProbRaw: bigint }
  | { kind: "near-certain"; probRaw: bigint; maxProbRaw: bigint }
  | { kind: "underpriced"; stakeBase: bigint; maxPayoutBase: bigint }
  | { kind: "over-payout-cap"; maxPayoutBase: bigint; capBase: bigint }
  | { kind: "zero" };

/** Reserve writes: every one journals, simulates, sends and books through the same lane shape as a vault write. */
export type RangeIntent =
  /** PD-2: one signed RedStone spot for the Window's ticker (`verifySpot` payload), fetched just before the send. */
  | { kind: "range-open"; marketId: MarketId; asset: string; side: RangeSide; lowPrint: bigint; highPrint: bigint; maxPayoutBase: bigint; maxStakeBase: bigint; spotProof: `0x${string}` }
  /** Permissionless: anyone may settle a round once the engine has answered its Window. */
  | { kind: "range-settle"; roundId: bigint; marketId: MarketId }
  /** Permissionless: refunds a round the engine never answered, after the grace (`MustSettle` once it has). */
  | { kind: "range-void-stale"; roundId: bigint }
  /** Permissionless: the payout only ever goes to the round's owner. */
  | { kind: "range-claim"; roundId: bigint }
  /** P12: collect a payout the owner's receive policy held as owed. */
  | { kind: "range-claim-owed" }
  | { kind: "range-supply"; amountBase: bigint }
  | { kind: "range-withdraw"; shares: bigint };

export const RANGE_NOT_DEPLOYED = "RangeReserve is not deployed on this network yet" as const;
/** The oracle's print scale for the venue's Windows: cents (context/40, context/43). */
export const PRINT_DECIMALS = 2;
/**
 * The basis moves with every second left in a Window, so a stake cap equal to the quote can never land on a
 * short lane (measured live 2026-09-02: +0.06% in the seconds between quote and send, +0.3% on a 15m Window).
 * The reference caps its mint cost with a cadence-aware buffer; the open accepts up to this much over the quote
 * and the contract charges the exact fresh stake.
 */
export const RANGE_STAKE_HEADROOM_BPS = 300;
