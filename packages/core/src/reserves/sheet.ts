// Ported from Agari 03b30ab:packages/core/src/reserves/sheet.ts
import type { LeverageReserveState } from "../leverage/types";
import type { MakerVaultState } from "../maker/types";
import type { ParlayReserveState } from "../parlay/types";
import type { RangeReserveState } from "../range/types";
import { oneUnit } from "../units/decimals";

/** The four house reserves a wallet can supply. Inverse positions (A-1b) ride the boost reserve, so they share its sheet. */
export type ReserveKind = "maker" | "range" | "parlay" | "boost";

/**
 * One reserve's balance sheet, in the terms every supplier panel reads.
 *
 * Every reserve keeps the same books on chain: equity is the vault's own token balance less what it owes users,
 * and what a provider may take out is that equity less what is already promised. The four programs name the
 * promised part differently (Windows quoted, bands locked, legs locked, boosts outstanding), so it is one field
 * here with the reserve's own word beside it.
 */
export interface ReserveSheet {
  kind: ReserveKind;
  decimals: number;
  paused: boolean;
  /** Equity that can pay a withdrawal right now (`free_base` on chain). */
  liquidBase: bigint;
  /** Equity already backing promises the reserve has made; it comes back as those settle. */
  committedBase: bigint;
  /** Provider equity: everything in the vault that is not already somebody else's. */
  totalValueBase: bigint;
  utilizationBps: number;
  supplyShares: bigint;
  /** Collateral per share, scaled by `oneUnit(decimals)`. */
  sharePriceRaw: bigint;
}

/**
 * Collateral per share, as the programs price it: equity over shares, floored.
 *
 * Par with no shares outstanding is not a display default — it is the programs' own first-supply rule (one share
 * per unit), so a fresh reserve reads 1.0000 here and on chain alike.
 */
export function sharePriceRawOf(totalValueBase: bigint, supplyShares: bigint, decimals: number): bigint {
  const one = oneUnit(decimals);
  return supplyShares > 0n && totalValueBase > 0n ? (totalValueBase * one) / supplyShares : one;
}

/** The maker vault carries its own share price (it prices Windows it is still holding); the rest is the same sheet. */
export function makerSheet(vault: MakerVaultState): ReserveSheet {
  return {
    kind: "maker",
    decimals: vault.decimals,
    paused: vault.paused,
    liquidBase: vault.liquidBase,
    committedBase: vault.deployedBase,
    totalValueBase: vault.totalValueBase,
    utilizationBps: vault.utilizationBps,
    supplyShares: vault.supplyShares,
    sharePriceRaw: vault.sharePriceRaw,
  };
}

export function rangeSheet(reserve: RangeReserveState): ReserveSheet {
  return sheetOf("range", reserve.decimals, reserve.paused, reserve.liquidBase, reserve.lockedBase, reserve.totalValueBase, reserve.utilizationBps, reserve.supplyShares);
}

export function parlaySheet(reserve: ParlayReserveState): ReserveSheet {
  return sheetOf("parlay", reserve.decimals, reserve.paused, reserve.liquidBase, reserve.lockedBase, reserve.totalValueBase, reserve.utilizationBps, reserve.supplyShares);
}

export function boostSheet(reserve: LeverageReserveState): ReserveSheet {
  return sheetOf("boost", reserve.decimals, reserve.paused, reserve.liquidBase, reserve.outstandingBase, reserve.totalValueBase, reserve.utilizationBps, reserve.supplyShares);
}

function sheetOf(
  kind: ReserveKind,
  decimals: number,
  paused: boolean,
  liquidBase: bigint,
  committedBase: bigint,
  totalValueBase: bigint,
  utilizationBps: number,
  supplyShares: bigint,
): ReserveSheet {
  return { kind, decimals, paused, liquidBase, committedBase, totalValueBase, utilizationBps, supplyShares, sharePriceRaw: sharePriceRawOf(totalValueBase, supplyShares, decimals) };
}

/**
 * What every reserve's provider read answers: shares held, what they are worth at the reserve's equity today,
 * and the two lifetime counters the programs keep on the provider account — everything supplied, and everything
 * paid back out. Those two are what makes a realized figure possible without a projection (A-2c).
 */
export interface ProviderShares {
  shares: bigint;
  worthBase: bigint;
  suppliedBase: bigint;
  withdrawnBase: bigint;
}

/**
 * What a supplier has actually made here, and what is still only on paper (A-2c).
 *
 * A withdrawal returns cost before it returns profit, so nothing counts as earned until every unit supplied has
 * come back: `realizedBase` is what left the reserve beyond cost, and it is money that is already in the wallet.
 * `unrealizedBase` is the rest of the position marked at today's share price, which the next settled Window can
 * still take away, and it is signed — a reserve carrying a loss shows it. There is no rate here and there is no
 * projection: "never a fake APY" (`00-plan.md` §S14).
 */
export interface RealizedYield {
  /** Paid out above everything ever supplied. Never negative: a loss shows as cost that has not come back. */
  realizedBase: bigint;
  /** Of everything supplied, what has not been paid back yet. */
  costStillInBase: bigint;
  /** `worth − costStillIn`, signed: what today's share price adds to, or takes off, the cost still in. */
  unrealizedBase: bigint;
}

export function realizedYield(position: { suppliedBase: bigint; withdrawnBase: bigint; worthBase: bigint }): RealizedYield {
  const { suppliedBase, withdrawnBase, worthBase } = position;
  const returnedOfCost = withdrawnBase < suppliedBase ? withdrawnBase : suppliedBase;
  return { realizedBase: withdrawnBase - returnedOfCost, costStillInBase: suppliedBase - returnedOfCost, unrealizedBase: worthBase - (suppliedBase - returnedOfCost) };
}

/** One wallet's stake in a reserve, split by what the reserve can actually pay out right now. */
export interface SupplierPosition {
  shares: bigint;
  worthBase: bigint;
  /** The part of `worthBase` liquid capital can pay today. */
  idleBase: bigint;
  /** The shares to send to `provider_withdraw` for exactly `idleBase`, floored so the program never refuses. */
  idleShares: bigint;
  /** The rest: this wallet's share of capital the reserve has promised elsewhere. */
  committedBase: bigint;
}

/**
 * What a provider can take out, in the programs' own arithmetic.
 *
 * Every reserve refuses a withdrawal larger than its free capital (`InsufficientLiquidity`), so the panel asks
 * for the shares that free capital covers and names the rest rather than sending a transaction that reverts.
 * The share count floors: one unit short is paid, one unit over is refused.
 */
export function supplierPosition(sheet: ReserveSheet, shares: bigint, worthBase: bigint): SupplierPosition {
  if (shares <= 0n || worthBase <= 0n) return { shares: shares > 0n ? shares : 0n, worthBase: worthBase > 0n ? worthBase : 0n, idleBase: 0n, idleShares: 0n, committedBase: 0n };
  const idleBase = worthBase < sheet.liquidBase ? worthBase : sheet.liquidBase;
  const idleShares = (shares * idleBase) / worthBase;
  return { shares, worthBase, idleBase, idleShares, committedBase: worthBase - idleBase };
}

/**
 * The shares to send for a partial withdrawal of `amountBase` (R4-7, D-227; Mitoshi's Trading Balance already takes a
 * partial amount, E.5 S7). Floored like `supplierPosition`, so the program pays at most what was asked and never
 * refuses for liquidity: `amount × shares ÷ worth`, capped at the shares idle capital covers. An amount at or over what
 * is idle sends exactly `idleShares` (Max), and nothing asked or nothing idle sends none.
 */
export function withdrawSharesFor(position: SupplierPosition, amountBase: bigint): bigint {
  if (amountBase <= 0n || position.idleShares <= 0n || position.worthBase <= 0n) return 0n;
  if (amountBase >= position.idleBase) return position.idleShares;
  const shares = (amountBase * position.shares) / position.worthBase;
  return shares < position.idleShares ? shares : position.idleShares;
}
