// Ported from Agari 03b30ab:packages/core/src/market/distance.ts
import type { Side } from "../types/market";

export interface NeededMove {
  /** Raw price move UP still needs to win (0 when UP is currently winning). */
  upNeedsRaw: bigint;
  /** Raw price move DOWN still needs to win (0 when DOWN is currently winning). */
  downNeedsRaw: bigint;
  leading: Side;
}

/** UP wins when the close is at or above the opening print, so the tie belongs to UP. */
export function neededMove(currentRaw: bigint, openingRaw: bigint): NeededMove {
  if (currentRaw >= openingRaw) {
    return { upNeedsRaw: 0n, downNeedsRaw: currentRaw - openingRaw + 1n, leading: "up" };
  }
  return { upNeedsRaw: openingRaw - currentRaw, downNeedsRaw: 0n, leading: "down" };
}
