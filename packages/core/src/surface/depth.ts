// Ported from Masayume 68f7a09:packages/core/src/surface/depth.ts
import type { BookLevelView } from "../types/trading";

/** One resting level with everything closer to the top of the book stacked under it. */
export interface DepthStep {
  priceBps: number;
  quantityRaw: bigint;
  cumulativeRaw: bigint;
}

/** Cumulative size in the order given — best level first, as the book reads. */
export function cumulativeDepth(levels: readonly BookLevelView[]): DepthStep[] {
  let running = 0n;
  return levels.map((level) => {
    running += level.quantityRaw;
    return { priceBps: level.priceBps, quantityRaw: level.quantityRaw, cumulativeRaw: running };
  });
}

export interface DepthBounds {
  /** The price axis, bps, padded so the outermost levels do not sit on the frame. */
  minBps: number;
  maxBps: number;
  /** The tallest cumulative stack on either side — the size axis. */
  maxCumulativeRaw: bigint;
}

/** Price and size extents for drawing both sides on one axis; null when nothing rests. */
export function depthBounds(bids: readonly DepthStep[], asks: readonly DepthStep[], padBps = 100): DepthBounds | null {
  const prices = [...bids, ...asks].map((step) => step.priceBps);
  if (prices.length === 0) return null;
  const tallest = [...bids, ...asks].reduce((max, step) => (step.cumulativeRaw > max ? step.cumulativeRaw : max), 0n);
  return {
    minBps: Math.max(0, Math.min(...prices) - padBps),
    maxBps: Math.min(10_000, Math.max(...prices) + padBps),
    maxCumulativeRaw: tallest,
  };
}
