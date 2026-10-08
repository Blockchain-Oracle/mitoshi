// Ported from Masayume 68f7a09:services/ops/src/actors/leverage-keeper/decide.ts — the mark now has two halves (A.4.3,
// D-174): rested depth for the whole position (D-114) and the fair-value model on a verified spot (PD-2, Q-022). The
// keeper cranks only what the contract would accept; both calls are permissionless and pay the owner, never the keeper.

export interface PositionView {
  positionId: bigint;
  marketId: `0x${string}`;
  quantityRaw: bigint;
}

/** `markOf`: rested depth's price for the whole position; `knockable` already requires the whole size to fill. */
export interface BookMark {
  markRaw: bigint;
  filledRaw: bigint;
  lineRaw: bigint;
  knockable: boolean;
}

/** `fairMarkOf` at the spot the keeper will prove: the model's value of the position. */
export interface FairMark {
  fairMarkRaw: bigint;
  knockable: boolean;
}

export type PositionAction =
  | { kind: "settle"; positionId: bigint; marketId: `0x${string}`; why: string }
  | { kind: "knock-out"; positionId: bigint; marketId: `0x${string}`; why: string }
  | { kind: "hold"; positionId: bigint; marketId: `0x${string}`; why: string; needsSpot: boolean };

/**
 * One live boost: settle once the engine has decided its Window; knock out once rested depth takes the whole position
 * under the line AND the model on a fresh spot agrees; otherwise leave it, saying which half held it back. `fair` is
 * null until the keeper has a spot proof (it only fetches one when the book half already says knock out).
 */
export function decidePosition(p: PositionView, terminal: boolean, mark: BookMark | null, fair: FairMark | null): PositionAction {
  const { positionId, marketId } = p;
  if (terminal) return { kind: "settle", positionId, marketId, why: "the engine decided the Window" };
  if (!mark) return { kind: "hold", positionId, marketId, why: "mark unreadable", needsSpot: false };
  const underLine = mark.markRaw * 10_000n < mark.lineRaw * 10_000n;
  if (!mark.knockable) {
    if (underLine && mark.filledRaw < p.quantityRaw) {
      return { kind: "hold", positionId, marketId, why: `under the line ${mark.lineRaw} but rested depth takes only ${mark.filledRaw} of ${p.quantityRaw} (D-114)`, needsSpot: false };
    }
    return { kind: "hold", positionId, marketId, why: `mark ${mark.markRaw} over the line ${mark.lineRaw}`, needsSpot: false };
  }
  if (!fair) return { kind: "hold", positionId, marketId, why: `book mark ${mark.markRaw} under the line ${mark.lineRaw}: needs a spot`, needsSpot: true };
  if (!fair.knockable) return { kind: "hold", positionId, marketId, why: `book says knock out, the model at the spot says ${fair.fairMarkRaw} ≥ line ${mark.lineRaw} (PD-2)`, needsSpot: true };
  return { kind: "knock-out", positionId, marketId, why: `mark ${mark.markRaw} and model ${fair.fairMarkRaw} under the line ${mark.lineRaw}` };
}
