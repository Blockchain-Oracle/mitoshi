// Ported from Masayume 68f7a09:packages/core/src/leverage/sizing.ts
import { BPS_DENOMINATOR } from "../constants/sizing";
import { ceilDiv } from "../units/money";

const BPS = BigInt(BPS_DENOMINATOR);

/** One resting level in the venue's own terms: the YES price, whatever kind rests there (context/44). */
export interface YesLevel {
  priceRaw: bigint;
  quantityRaw: bigint;
}

/** Mirrors `LeverageMath.sidePrice`: a NO taker pays the rest of a set. */
export function sidePrice(yesPriceRaw: bigint, invert: boolean, one: bigint): bigint {
  return invert ? one - yesPriceRaw : yesPriceRaw;
}

export interface Walk {
  costBase: bigint;
  filledRaw: bigint;
  limitYesRaw: bigint;
}

/** Mirrors `LeverageMath.walkQuantity`: the first `quantityRaw` contracts off the levels, cost rounded up once. */
export function walkQuantity(levels: readonly YesLevel[], invert: boolean, one: bigint, quantityRaw: bigint): Walk {
  let weighted = 0n;
  let filledRaw = 0n;
  let limitYesRaw = 0n;
  for (const level of levels) {
    if (filledRaw >= quantityRaw) break;
    const take = level.quantityRaw < quantityRaw - filledRaw ? level.quantityRaw : quantityRaw - filledRaw;
    if (take === 0n) continue;
    weighted += take * sidePrice(level.priceRaw, invert, one);
    filledRaw += take;
    limitYesRaw = level.priceRaw;
  }
  return { costBase: ceilDiv(weighted, one), filledRaw, limitYesRaw };
}

/** Mirrors `LeverageMath.walkBudget`: the most contracts a budget buys, floored to the venue's lot. */
export function walkBudget(levels: readonly YesLevel[], invert: boolean, one: bigint, budgetBase: bigint, lotRaw: bigint): bigint {
  let weighted = 0n;
  let quantityRaw = 0n;
  const cap = budgetBase * one;
  for (const level of levels) {
    const price = sidePrice(level.priceRaw, invert, one);
    if (price === 0n) continue;
    let take = (cap - weighted) / price;
    if (level.quantityRaw < take) take = level.quantityRaw;
    weighted += take * price;
    quantityRaw += take;
    if (take < level.quantityRaw) break;
  }
  return lotRaw > 1n ? (quantityRaw / lotRaw) * lotRaw : quantityRaw;
}

/** Mirrors `LeverageMath.deployScale`: `L − (L − 1)·premium`, scaled BPS². */
export function deployScale(leverageBps: number, premiumBps: number): bigint {
  const lev = BigInt(leverageBps);
  return lev * BPS - (lev - BPS) * BigInt(premiumBps);
}

/** Mirrors `LeverageMath.budgetFor`: the notional a stake deploys — the stake plus the front, less the premium. */
export function budgetFor(stakeBase: bigint, leverageBps: number, premiumBps: number): bigint {
  return (stakeBase * deployScale(leverageBps, premiumBps)) / (BPS * BPS);
}

export interface Terms {
  stakeBase: bigint;
  frontedBase: bigint;
  premiumBase: bigint;
}

/** Mirrors `LeverageMath.terms`: the owner's cash, the reserve's front and its premium behind a fill, exactly. */
export function terms(costBase: bigint, leverageBps: number, premiumBps: number): Terms {
  const nominal = ceilDiv(costBase * BPS * BPS, deployScale(leverageBps, premiumBps));
  const frontedBase = (nominal * (BigInt(leverageBps) - BPS)) / BPS;
  const premiumBase = (frontedBase * BigInt(premiumBps)) / BPS;
  return { stakeBase: costBase + premiumBase - frontedBase, frontedBase, premiumBase };
}

/** Mirrors `LeverageMath.winIfRight`: the contracts pay one each, the reserve is repaid first. */
export function winIfRight(quantityRaw: bigint, frontedBase: bigint): bigint {
  return quantityRaw > frontedBase ? quantityRaw - frontedBase : 0n;
}

/** The mark at which anyone may knock the position out: `fronted × maintenance`. */
export function knockoutLine(frontedBase: bigint, maintenanceBps: number): bigint {
  return (frontedBase * BigInt(maintenanceBps)) / BPS;
}

/** Mirrors `LeverageMath.isKnockable`. */
export function isKnockable(markBase: bigint, frontedBase: bigint, maintenanceBps: number): boolean {
  return frontedBase !== 0n && markBase * BPS < frontedBase * BigInt(maintenanceBps);
}

/** Mirrors `LeverageMath.split`: what proceeds repay of the front, and what is left for the owner. */
export function split(proceedsBase: bigint, frontedBase: bigint): { reclaimedBase: bigint; returnedBase: bigint } {
  const reclaimedBase = proceedsBase < frontedBase ? proceedsBase : frontedBase;
  return { reclaimedBase, returnedBase: proceedsBase - reclaimedBase };
}

/** Mirrors the gateway's `_markOver`: the exit walk, a unit under its ceiling-rounded cost. */
export function markOverLevels(exitLevels: readonly YesLevel[], invert: boolean, one: bigint, quantityRaw: bigint): { markBase: bigint; filledRaw: bigint } {
  const walk = walkQuantity(exitLevels, invert, one, quantityRaw);
  return { markBase: walk.costBase === 0n ? 0n : walk.costBase - 1n, filledRaw: walk.filledRaw };
}

/** `(stake + fronted) / stake` in thousandths — the multiple a position actually carries after the lot floor. */
export function effectiveMultipleMilli(stakeBase: bigint, frontedBase: bigint): number {
  return stakeBase > 0n ? Number(((stakeBase + frontedBase) * 1000n) / stakeBase) : 0;
}

/** The owner's equity right now: the mark less the reserve's claim, never below zero. */
export function equityOf(markBase: bigint, frontedBase: bigint): bigint {
  return markBase > frontedBase ? markBase - frontedBase : 0n;
}
