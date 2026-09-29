// Ported from Masayume 68f7a09:packages/core/src/surface/structure.ts
import type { BookDepth, BookLevelView } from "../types/trading";

/**
 * The top of one Window's book, read the way DreamDEX keeps it: ONE book in UP (YES) terms.
 * The DOWN sides the SDK reports are that book mirrored (a DOWN ask at q is the UP bid at 1 − q),
 * so the mid and the spread are taken on the UP book alone and nothing is counted twice.
 */
export interface BookStructure {
  /** Best resting UP ask, bps — what buying UP costs now; null when no offer rests. */
  upAskBps: number | null;
  /** Best resting UP bid, bps — what selling UP fetches now; null when no bid rests. */
  upBidBps: number | null;
  /** What buying DOWN costs, in DOWN's own terms: the UP bid seen from the other side. */
  downAskBps: number | null;
  /**
   * Best bid at or above best ask. Seen live on the 5m lane while a maker re-lays its whole ladder
   * near the close (context/48): the orders did not match each other, and a taker still fills at
   * the ask. There is no mid and no spread to read off such a book.
   */
  crossed: boolean;
  /** Halfway between the best bid and the best ask; null unless both rest and the book is not crossed. */
  midBps: number | null;
  /** Ask − bid on the UP book; null unless both rest and the book is not crossed. */
  spreadBps: number | null;
  /** Contracts resting on each side within the depth read. */
  upAskDepthRaw: bigint;
  upBidDepthRaw: bigint;
  /** Resting price levels on both sides together. */
  levels: number;
}

/** Which figure stands in for "the market's UP price": the mid, or the one side that rests, or the ask of a crossed book. */
export type ImpliedBasis = "mid" | "ask" | "bid" | "crossed";

export interface ImpliedUp {
  bps: number;
  basis: ImpliedBasis;
}

export function sumQuantity(levels: readonly BookLevelView[]): bigint {
  return levels.reduce((acc, level) => acc + level.quantityRaw, 0n);
}

export function bookStructure(depth: BookDepth): BookStructure {
  const ask = depth.upAsks[0] ?? null;
  const bid = depth.upBids[0] ?? null;
  const downAsk = depth.downAsks[0] ?? null;
  const both = ask !== null && bid !== null;
  const crossed = both && bid.priceBps >= ask.priceBps;
  return {
    upAskBps: ask?.priceBps ?? null,
    upBidBps: bid?.priceBps ?? null,
    downAskBps: downAsk?.priceBps ?? null,
    crossed,
    midBps: both && !crossed ? Math.round((ask.priceBps + bid.priceBps) / 2) : null,
    spreadBps: both && !crossed ? ask.priceBps - bid.priceBps : null,
    upAskDepthRaw: sumQuantity(depth.upAsks),
    upBidDepthRaw: sumQuantity(depth.upBids),
    levels: depth.upAsks.length + depth.upBids.length,
  };
}

/**
 * The UP price a Window is trading at, and what that figure is: the mid when both sides rest,
 * the ask when the book is crossed (the offer a taker actually fills at), else the one side
 * that does rest. Null on an empty book — never a filled-in 50.
 */
export function impliedUp(structure: BookStructure): ImpliedUp | null {
  if (structure.midBps !== null) return { bps: structure.midBps, basis: "mid" };
  if (structure.crossed && structure.upAskBps !== null) return { bps: structure.upAskBps, basis: "crossed" };
  if (structure.upAskBps !== null) return { bps: structure.upAskBps, basis: "ask" };
  if (structure.upBidBps !== null) return { bps: structure.upBidBps, basis: "bid" };
  return null;
}
