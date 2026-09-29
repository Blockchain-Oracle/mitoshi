// Ported from Masayume 68f7a09:packages/core/src/parlay/pricing.ts
import { BPS_DENOMINATOR } from "../constants/sizing";
import type { BookLevelView } from "../types/trading";
import { ceilDiv } from "../units/money";
import type { ParlayMode, ParlayParams, ParlayQuote, ParlayRefusal } from "./types";

const BPS = BigInt(BPS_DENOMINATOR);
/** The reference's builder cap (`PARLAY_MAX_LEGS`); the contract's `maxLegs` may be wider, the surface never is. */
export const PARLAY_MAX_LEGS = 3;
export const PARLAY_MIN_LEGS = 2;

/**
 * Mirrors `ParlayMath.vwap` for levels already in the bought side's own terms (a `BookDepth` side's
 * asks): the cost-weighted price of the first `quantityRaw` contracts, rounded up, and how much rests.
 */
export function legPriceOverLevels(levels: readonly BookLevelView[], quantityRaw: bigint): { priceRaw: bigint; filledRaw: bigint } {
  let cost = 0n;
  let filledRaw = 0n;
  for (const level of levels) {
    if (filledRaw >= quantityRaw) break;
    const take = level.quantityRaw < quantityRaw - filledRaw ? level.quantityRaw : quantityRaw - filledRaw;
    cost += take * level.priceRaw;
    filledRaw += take;
  }
  if (filledRaw === 0n) return { priceRaw: 0n, filledRaw: 0n };
  return { priceRaw: ceilDiv(cost, filledRaw), filledRaw };
}

/** Mirrors `ParlayMath.combine`: Π prices, floored at λ · min when two legs settle at the same instant. */
export function combineProb(pricesRaw: readonly bigint[], expiriesSec: readonly number[], one: bigint, correlationBps: number): bigint {
  let combined = one;
  let minPrice = one;
  for (const price of pricesRaw) {
    combined = (combined * price) / one;
    if (price < minPrice) minPrice = price;
  }
  if (hasSharedInstant(expiriesSec)) {
    const floor = (minPrice * BigInt(correlationBps)) / BPS;
    if (floor > combined) combined = floor;
  }
  return combined;
}

export function productProb(pricesRaw: readonly bigint[], one: bigint): bigint {
  return pricesRaw.reduce((acc, price) => (acc * price) / one, one);
}

export function hasSharedInstant(expiriesSec: readonly number[]): boolean {
  return new Set(expiriesSec).size !== expiriesSec.length;
}

/** Mirrors `ParlayMath.floorStake`: fair value plus the margin, both rounded up in the reserve's favour. */
export function floorStake(maxPayoutBase: bigint, combinedProbRaw: bigint, one: bigint, marginBps: number): bigint {
  const fair = ceilDiv(maxPayoutBase * combinedProbRaw, one);
  return ceilDiv(fair * (BPS + BigInt(marginBps)), BPS);
}

/** The largest payout whose floored stake fits inside `stakeBase` — the "Set stake" solve; 0 when none does. */
export function maxPayoutForStake(stakeBase: bigint, combinedProbRaw: bigint, one: bigint, marginBps: number): bigint {
  if (combinedProbRaw === 0n) return 0n;
  let payout = (stakeBase * BPS * one) / (combinedProbRaw * (BPS + BigInt(marginBps)));
  while (payout > 0n && floorStake(payout, combinedProbRaw, one, marginBps) > stakeBase) payout -= 1n;
  return payout;
}

export function multiplierMilli(maxPayoutBase: bigint, stakeBase: bigint): number {
  return stakeBase > 0n ? Number((maxPayoutBase * 1000n) / stakeBase) : 0;
}

export interface QuoteLeg {
  expirySec: number;
  /** The bought side's asks, in that side's own terms (`BookDepth.upAsks` or `downAsks`). */
  asks: readonly BookLevelView[];
}

export interface ParlayQuoteInput {
  legs: readonly QuoteLeg[];
  mode: ParlayMode;
  params: Pick<ParlayParams, "marginBps" | "correlationBps" | "priceDepthRaw" | "minCombinedProbRaw" | "maxPayoutCapBase" | "maxLegs">;
  one: bigint;
  decimals: number;
  nowMs: number;
}

export type ParlayQuoteResult = { ok: true; quote: ParlayQuote } | { ok: false; refusal: ParlayRefusal };

function refuse(refusal: ParlayRefusal): ParlayQuoteResult {
  return { ok: false, refusal };
}

/**
 * The reserve's own arithmetic off a book snapshot, for an instant estimate and for the tests that pin
 * it to the contract. A "Set stake" quote prices twice — once over the floor depth, then over the payout
 * that stake buys — so the depth it quotes at is never shallower than what the contract will use, and
 * the stake it shows can only be more than the chain charges, never less.
 */
export function quoteParlay(input: ParlayQuoteInput): ParlayQuoteResult {
  const { legs, mode, params, one, decimals, nowMs } = input;
  const maxLegs = Math.min(params.maxLegs, PARLAY_MAX_LEGS);
  if (legs.length < PARLAY_MIN_LEGS || legs.length > maxLegs) return refuse({ kind: "legs", count: legs.length, min: PARLAY_MIN_LEGS, max: maxLegs });
  const amount = mode.kind === "fixStake" ? mode.stakeBase : mode.maxPayoutBase;
  if (amount <= 0n) return refuse({ kind: "zero" });

  const firstDepth = mode.kind === "fixPayout" ? maxOf(params.priceDepthRaw, mode.maxPayoutBase) : params.priceDepthRaw;
  const first = priceAt(legs, firstDepth, params, one);
  if (!first.ok) return first;
  let { pricesRaw, combinedProbRaw } = first;
  let maxPayoutBase = mode.kind === "fixPayout" ? mode.maxPayoutBase : maxPayoutForStake(mode.stakeBase, combinedProbRaw, one, params.marginBps);

  if (mode.kind === "fixStake" && maxPayoutBase > firstDepth) {
    const second = priceAt(legs, maxPayoutBase, params, one);
    if (!second.ok) return second;
    ({ pricesRaw, combinedProbRaw } = second);
    maxPayoutBase = maxPayoutForStake(mode.stakeBase, combinedProbRaw, one, params.marginBps);
  }

  if (maxPayoutBase > params.maxPayoutCapBase) return refuse({ kind: "over-payout-cap", maxPayoutBase, capBase: params.maxPayoutCapBase });
  if (maxPayoutBase <= 0n) return refuse({ kind: "underpriced", stakeBase: amount, maxPayoutBase });
  const stakeBase = floorStake(maxPayoutBase, combinedProbRaw, one, params.marginBps);
  if (stakeBase >= maxPayoutBase) return refuse({ kind: "underpriced", stakeBase, maxPayoutBase });

  const expiries = legs.map((leg) => leg.expirySec);
  return {
    ok: true,
    quote: {
      legPricesRaw: pricesRaw,
      legProbBps: pricesRaw.map((price) => Number((price * BPS) / one)),
      combinedProbRaw,
      rawCombinedProbRaw: productProb(pricesRaw, one),
      correlated: hasSharedInstant(expiries),
      stakeBase,
      maxPayoutBase,
      multiplierMilli: multiplierMilli(maxPayoutBase, stakeBase),
      decimals,
      quotedAtMs: nowMs,
    },
  };
}

type Priced = { ok: true; pricesRaw: bigint[]; combinedProbRaw: bigint } | { ok: false; refusal: ParlayRefusal };

function priceAt(legs: readonly QuoteLeg[], depthRaw: bigint, params: ParlayQuoteInput["params"], one: bigint): Priced {
  const pricesRaw: bigint[] = [];
  for (const [legIdx, leg] of legs.entries()) {
    const { priceRaw, filledRaw } = legPriceOverLevels(leg.asks, depthRaw);
    if (filledRaw < depthRaw) return { ok: false, refusal: { kind: "thin-book", legIdx, availableRaw: filledRaw, neededRaw: depthRaw } };
    pricesRaw.push(priceRaw);
  }
  const combinedProbRaw = combineProb(
    pricesRaw,
    legs.map((leg) => leg.expirySec),
    one,
    params.correlationBps,
  );
  if (combinedProbRaw < params.minCombinedProbRaw) return { ok: false, refusal: { kind: "long-shot", combinedProbRaw, minCombinedProbRaw: params.minCombinedProbRaw } };
  return { ok: true, pricesRaw, combinedProbRaw };
}

function maxOf(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}
