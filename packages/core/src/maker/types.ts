// Ported from Masayume 68f7a09:packages/core/src/maker/types.ts
import type { MarketId } from "../types/market";
import type { Address } from "../types/primitives";

/** One Window's flow through the vault, in collateral — the contract's `WindowBook`. */
export interface MakerWindowBook {
  marketId: MarketId;
  escrowOutBase: bigint;
  escrowBackBase: bigint;
  mergedBase: bigint;
  payoutBase: bigint;
  openedAtSec: number;
  settledAtSec: number | null;
  quoteCount: number;
  settled: boolean;
}

/** A book with what the vault holds on the Window right now. */
export interface MakerWindowView extends MakerWindowBook {
  yesRaw: bigint;
  noRaw: bigint;
  /** `escrowOut − escrowBack − merged − payout`, floored — capital the venue still holds for the vault. */
  deployedBase: bigint;
  /** The signed result once settled; null while open. */
  realizedBase: bigint | null;
}

export interface MakerParams {
  maxExposureBps: number;
  minSpreadRaw: bigint;
  minPriceRaw: bigint;
  maxPriceRaw: bigint;
  maxQuantityRaw: bigint;
  maxWindowDeployedBase: bigint;
  maxOpenWindows: number;
  minTimeLeftSec: number;
}

/** Where the vault lives on one chain — regenerated from `contracts/deployments` (AD-10). */
export interface MakerDeployment {
  chainId: number;
  marketMakerVault: Address;
  fromBlock: bigint;
}

/** The vault's own balance sheet: what is idle, what the venue holds, what a share is worth, who quotes. */
export interface MakerVaultState {
  deployment: MakerDeployment;
  params: MakerParams;
  maker: Address | null;
  paused: boolean;
  liquidBase: bigint;
  deployedBase: bigint;
  totalValueBase: bigint;
  /** Collateral per share, scaled by `one`. */
  sharePriceRaw: bigint;
  utilizationBps: number;
  supplyShares: bigint;
  openWindows: MarketId[];
  decimals: number;
}

/** Vault writes: every one journals, simulates, sends and books through the same lane shape as a vault write. */
export type MakerIntent =
  | { kind: "maker-supply"; amountBase: bigint }
  | { kind: "maker-withdraw"; shares: bigint }
  /** The maker actor only: a YES bid and a YES ask, post-only, in the venue's terms. */
  | { kind: "maker-quote"; marketId: MarketId; bidYesRaw: bigint; askYesRaw: bigint; quantityRaw: bigint; expireNs: bigint }
  /** The maker any time; anyone once the Window has expired. */
  | { kind: "maker-pull"; marketId: MarketId }
  /** Permissionless: merges the vault's complete sets on a Window back into collateral. */
  | { kind: "maker-merge"; marketId: MarketId }
  /** Permissionless: settles a Window the venue has resolved or voided. */
  | { kind: "maker-settle"; marketId: MarketId };

export const MAKER_NOT_DEPLOYED = "MarketMakerVault is not deployed on this network yet" as const;
