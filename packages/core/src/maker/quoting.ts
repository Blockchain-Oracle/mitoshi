// Ported from Masayume 68f7a09:packages/core/src/maker/quoting.ts
import type { MakerWindowBook } from "./types";

/** Mirrors `MarketMakerVault.deployedOf`: what the venue still holds for the vault on a Window. */
export function deployedOf(book: Pick<MakerWindowBook, "escrowOutBase" | "escrowBackBase" | "mergedBase" | "payoutBase">): bigint {
  const back = book.escrowBackBase + book.mergedBase + book.payoutBase;
  return book.escrowOutBase > back ? book.escrowOutBase - back : 0n;
}

/** The signed result of a settled Window: everything that came back less everything that went out. */
export function realizedOf(book: Pick<MakerWindowBook, "escrowOutBase" | "escrowBackBase" | "mergedBase" | "payoutBase" | "settled">): bigint | null {
  if (!book.settled) return null;
  return book.escrowBackBase + book.mergedBase + book.payoutBase - book.escrowOutBase;
}

/** The book's fair YES price: the mid where both sides rest, one side where only it does, even odds where none. */
export function fairYesRaw(bestBidRaw: bigint | null, bestAskRaw: bigint | null, one: bigint): bigint {
  if (bestBidRaw !== null && bestAskRaw !== null) return (bestBidRaw + bestAskRaw) / 2n;
  return bestBidRaw ?? bestAskRaw ?? one / 2n;
}

export function snapDown(raw: bigint, tickRaw: bigint): bigint {
  return tickRaw <= 0n ? raw : (raw / tickRaw) * tickRaw;
}

export function snapUp(raw: bigint, tickRaw: bigint): bigint {
  if (tickRaw <= 0n) return raw;
  const down = snapDown(raw, tickRaw);
  return down === raw ? raw : down + tickRaw;
}

export interface PairInput {
  fairRaw: bigint;
  halfSpreadRaw: bigint;
  tickRaw: bigint;
  /** The vault's own bounds (`Params`): the pair must satisfy them or the contract refuses it. */
  minSpreadRaw: bigint;
  minPriceRaw: bigint;
  maxPriceRaw: bigint;
  /** The live top of book; a post-only order that would cross it is refused by the venue. */
  bestBidRaw: bigint | null;
  bestAskRaw: bigint | null;
}

export interface Pair {
  bidYesRaw: bigint;
  askYesRaw: bigint;
}

/**
 * A YES bid and a YES ask around the fair price, on the tick grid, never crossing the live book, at least
 * the vault's minimum spread apart and inside its price bounds. Null when no such pair exists — a decided
 * Window, or a book too tight to sit inside.
 */
export function pairAround(input: PairInput): Pair | null {
  const { fairRaw, halfSpreadRaw, tickRaw, minSpreadRaw, minPriceRaw, maxPriceRaw, bestBidRaw, bestAskRaw } = input;
  let bid = snapDown(fairRaw - halfSpreadRaw, tickRaw);
  let ask = snapUp(fairRaw + halfSpreadRaw, tickRaw);
  if (bestAskRaw !== null && bid >= bestAskRaw) bid = bestAskRaw - tickRaw;
  if (bestBidRaw !== null && ask <= bestBidRaw) ask = bestBidRaw + tickRaw;
  if (ask - bid < minSpreadRaw) {
    const centre = (bid + ask) / 2n;
    bid = snapDown(centre - minSpreadRaw / 2n, tickRaw);
    ask = bid + minSpreadRaw;
    if (bestAskRaw !== null && bid >= bestAskRaw) return null;
    if (bestBidRaw !== null && ask <= bestBidRaw) return null;
  }
  if (bid < minPriceRaw || ask > maxPriceRaw || bid <= 0n) return null;
  return { bidYesRaw: bid, askYesRaw: ask };
}

/** The venue's lot grid: a quantity floored to whole lots, zero when it would rest below the minimum. */
export function quantizeQuantity(quantityRaw: bigint, lotRaw: bigint, minQuantityRaw: bigint): bigint {
  const lots = lotRaw > 0n ? (quantityRaw / lotRaw) * lotRaw : quantityRaw;
  return lots < minQuantityRaw ? 0n : lots;
}

/** A quote's dead-man's switch: it expires on its own well before the Window does if the actor dies. */
export function quoteExpiryNs(nowSec: number, expirySec: number, ttlSec: number): bigint {
  return BigInt(Math.min(expirySec, nowSec + ttlSec)) * 1_000_000_000n;
}
