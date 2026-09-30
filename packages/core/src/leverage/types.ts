// Ported from Masayume 68f7a09:packages/core/src/leverage/types.ts
import type { MarketId, Side } from "../types/market";
import type { Address } from "../types/primitives";

/** The position's states, in the contract's enum order. */
export type LeveragePositionStatus = "live" | "closed" | "knocked-out" | "settled";
export const LEVERAGE_POSITION_STATUSES: readonly LeveragePositionStatus[] = ["live", "closed", "knocked-out", "settled"];

export function leverageStatusOf(index: number): LeveragePositionStatus {
  const status = LEVERAGE_POSITION_STATUSES[index];
  if (!status) throw new Error(`unknown leverage position status ${index}`);
  return status;
}

/** The multiples the Ticket offers — the reference's own (`Ticket624Drawer.tsx` L1075). 1× is a plain order. */
export const LEVERAGE_MULTIPLES = [1, 2, 3] as const;
export type LeverageMultiple = (typeof LEVERAGE_MULTIPLES)[number];
export const BPS_PER_X = 10_000;

export function leverageBpsOf(multiple: number): number {
  return Math.round(multiple * BPS_PER_X);
}

/** A boosted position as the reserve records it: the contracts it holds, the owner's stake, its own claim. */
export interface LeveragePosition {
  positionId: bigint;
  owner: Address;
  status: LeveragePositionStatus;
  side: Side;
  leverageBps: number;
  marketId: MarketId;
  openedAtSec: number;
  expirySec: number;
  exitedAtSec: number | null;
  quantityRaw: bigint;
  /** What the owner put in, premium included — the most they can lose. */
  stakeBase: bigint;
  /** The reserve's outstanding claim, repaid first out of whatever the contracts fetch. */
  frontedBase: bigint;
  premiumBase: bigint;
  /** Collateral per whole contract paid at open, in the bought side's own terms. */
  entryPriceRaw: bigint;
  proceedsBase: bigint;
  reclaimedBase: bigint;
  returnedBase: bigint;
}

export interface LeverageParams {
  maxLeverageBps: number;
  premiumBps: number;
  maintenanceBps: number;
  maxExposureBps: number;
  minEntryPriceRaw: bigint;
  maxEntryPriceRaw: bigint;
  maxFrontedPerPositionBase: bigint;
  maxWindowFrontedBase: bigint;
  maxOpenPositions: number;
  minTimeLeftSec: number;
  /** PD-2a (D-174): the knock-out and the at-birth walks count orders rested at least max(Series, this). */
  minRestSec: number;
  /** PD-2b (D-174): an entry refuses when its price is more than this above the fair-value model, per whole unit. */
  fairSlackRaw: bigint;
}

/** Where the reserve lives on one chain — regenerated from `contracts/deployments` (AD-10). */
export interface LeverageDeployment {
  chainId: number;
  leverageReserve: Address;
  fromBlock: bigint;
}

/** The reserve's own balance sheet: what it can front, what it has fronted, and its tunables. */
export interface LeverageReserveState {
  deployment: LeverageDeployment;
  params: LeverageParams;
  liquidBase: bigint;
  outstandingBase: bigint;
  totalValueBase: bigint;
  utilizationBps: number;
  supplyShares: bigint;
  paused: boolean;
  openPositions: number;
  decimals: number;
}

/** One boost quoted by the chain (`sizeForStake` / `previewOpen`): every figure the contract's own. */
export interface LeverageQuote {
  side: Side;
  leverageBps: number;
  quantityRaw: bigint;
  costBase: bigint;
  /** The worst level the walk touched, in the venue's YES terms — what the open sends as its limit. */
  limitYesRaw: bigint;
  /** Cost-weighted entry price per whole contract, in the bought side's own terms. */
  priceRaw: bigint;
  stakeBase: bigint;
  frontedBase: bigint;
  premiumBase: bigint;
  /** `quantity − fronted`: what the owner collects if the side lands. */
  winIfRightBase: bigint;
  /** The knock-out line the position opens with: `fronted × maintenance`. */
  lineBase: bigint;
  decimals: number;
  quotedAtMs: number;
}

/** What the book would pay for a position right now, against its knock-out line. */
export interface LeverageMark {
  markBase: bigint;
  filledRaw: bigint;
  lineBase: bigint;
  knockable: boolean;
}

/** Reserve writes: every one journals, simulates, sends and books through the same lane shape as a vault write. */
export type LeverageIntent =
  /** Stake-first: the reserve sizes the boost at execution; `minQuantityRaw` is the owner's guard against a moved book. */
  /** PD-2: one signed RedStone spot for the Window's ticker (`verifySpot` payload), fetched just before the send. */
  | { kind: "leverage-open"; marketId: MarketId; side: Side; stakeBase: bigint; leverageBps: number; minQuantityRaw: bigint; spotProof: `0x${string}` }
  /** The owner's cash-out at the book's bids; `minProceedsBase` is their own slippage guard. */
  | { kind: "leverage-close"; positionId: bigint; marketId: MarketId; minProceedsBase: bigint }
  /** Permissionless once the mark is under the line over rested depth and the model agrees (D-174): sells at the bids. */
  | { kind: "leverage-knock-out"; positionId: bigint; marketId: MarketId; spotProof: `0x${string}` }
  /** Permissionless: settles a position whose Window the venue resolved or voided. */
  | { kind: "leverage-settle"; positionId: bigint; marketId: MarketId }
  /** P12: collect a payout the owner's receive policy held as owed. */
  | { kind: "leverage-claim-owed" }
  | { kind: "leverage-supply"; amountBase: bigint }
  | { kind: "leverage-withdraw"; shares: bigint };

export const LEVERAGE_NOT_DEPLOYED = "LeverageReserve is not deployed on this network yet" as const;
