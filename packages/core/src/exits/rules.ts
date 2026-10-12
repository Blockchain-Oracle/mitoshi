/**
 * The exit rules (S23e, S24.3; D-200): one copy for the tab (`web/src/features/terminal`) and the exit keeper
 * (`services/ops/src/actors/exit-keeper`), so a trail or a take-profit fires on the same condition wherever it runs.
 * Trail is on the asset's spot with break-even as its reference (Tradash's rule); TP and SL are on the exit value — what
 * Close pays (D-197). Spots are numbers (display prices); money is integers.
 * Ported from Owarine ecb7565b:web/src/features/terminal/terminal-positions.ts (`trailEligible`, `ratchet`, `trailHit`).
 */
import type { Side } from "../types/market";

/** Whether Trail may arm: the spot has moved more than `pct` past `ref` in the position's favour. */
export function trailEligible(side: Side, spot: number | null, ref: number | null, pct: number): boolean {
  if (spot === null || ref === null || !(ref > 0)) return false;
  return (side === "up" ? spot / ref - 1 : 1 - spot / ref) > pct;
}

/** The first stop when Trail arms: `pct` behind the spot, never past break-even. */
export const trailStart = (side: Side, spot: number, ref: number, pct: number): number => (side === "up" ? Math.max(spot * (1 - pct), ref) : Math.min(spot * (1 + pct), ref));

/** The next trail stop: it only ever moves in the position's favour. */
export const ratchet = (side: Side, stop: number, spot: number, pct: number): number => (side === "up" ? Math.max(stop, spot * (1 - pct)) : Math.min(stop, spot * (1 + pct)));

export const trailHit = (side: Side, stop: number, spot: number): boolean => (side === "up" ? spot <= stop : spot >= stop);

/** Whether a take-profit or a stop-loss is hit by what Close pays now (both on the exit value, D-197). */
export function exitHit(valueBase: bigint, tpBase: bigint | null, slBase: bigint | null): "tp" | "sl" | null {
  if (tpBase !== null && valueBase >= tpBase) return "tp";
  if (slBase !== null && valueBase <= slBase) return "sl";
  return null;
}

/**
 * What an exit trigger compares (D-227): Close's proceeds for the lots the book takes, scaled to everything held at the
 * same price. A take-profit or stop-loss is a target for the whole position, so a book that rests 30 % of the size reads
 * as that price on all of it — never as a 70 % drawdown that sells. Null when nothing fills.
 */
export function likeForLikeBase(proceedsBase: bigint, soldRaw: bigint, heldRaw: bigint): bigint | null {
  if (soldRaw <= 0n) return null;
  return soldRaw >= heldRaw ? proceedsBase : (proceedsBase * heldRaw) / soldRaw;
}
