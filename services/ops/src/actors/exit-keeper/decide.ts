/**
 * The exit keeper's decisions (S24.3), pure: the tab's rules (`@cwf/core/exits`) on the keeper's reads. A trail steps
 * on every display tick (spots × 10⁸); a take-profit or stop-loss reads what Close pays on the book; the Window and the
 * holding decide whether the trigger is still live at all.
 */
import { exitHit, ratchet, trailHit, type ExitReason } from "@cwf/core/exits";
import type { Side } from "@cwf/core";

export interface Armed {
  side: Side;
  takeProfitBase: bigint | null;
  stopLossBase: bigint | null;
  trailBps: number | null;
}

export type TrailStep = { kind: "hold" } | { kind: "move"; stopE8: bigint } | { kind: "hit" };

/** One display tick against a trail: hit when the spot reaches the stop, else the stop follows in the position's favour. */
export function trailStep(a: Armed, stopE8: bigint, spotE8: bigint): TrailStep {
  if (a.trailBps === null || spotE8 <= 0n) return { kind: "hold" };
  if (trailHit(a.side, Number(stopE8), Number(spotE8))) return { kind: "hit" };
  const next = BigInt(Math.round(ratchet(a.side, Number(stopE8), Number(spotE8), a.trailBps / 10_000)));
  return (a.side === "up" ? next > stopE8 : next < stopE8) ? { kind: "move", stopE8: next } : { kind: "hold" };
}

export interface PassRead {
  heldRaw: bigint;
  /** Null when the Window was not read. */
  window: { trading: boolean; lockAtSec: number; lotBase: bigint } | null;
  /** What Close pays for the holding now; null when not asked for or nothing would fill. */
  valueBase: bigint | null;
}

export type Verdict =
  | { kind: "watch" }
  | { kind: "wait"; why: string }
  | { kind: "close"; status: "expired" | "gone"; why: string }
  | { kind: "fire"; reason: ExitReason };

/** What one pass does with a trigger: end it, fire it, or keep watching. */
export function judge(a: Armed, read: PassRead, nowSec: number, trailIsHit: boolean): Verdict {
  if (!read.window) return { kind: "wait", why: "the Window was not read" };
  if (!read.window.trading || nowSec >= read.window.lockAtSec) return { kind: "close", status: "expired", why: "the Window locked" };
  // Under one lot can't be sold; it settles with the Window.
  if (read.heldRaw < read.window.lotBase) return { kind: "close", status: "gone", why: "nothing left to sell" };
  if (trailIsHit) return { kind: "fire", reason: "trail" };
  if (read.valueBase !== null) {
    const hit = exitHit(read.valueBase, a.takeProfitBase, a.stopLossBase);
    if (hit) return { kind: "fire", reason: hit };
  }
  return { kind: "watch" };
}

/** A sale that didn't land waits a little longer each time (the floor may sit above the bids for a while). */
export const retryDelayMs = (attempts: number): number => Math.min(20_000, 2_000 * Math.max(1, attempts));

/**
 * Ticks the sale's limit leads the floor read by: the guard prices on `block.timestamp` (τ to the close), so the floor
 * of a side worth more than half rises between the keeper's read and the block that includes the sale — a limit at the
 * read floor came back `BelowFairFloor` three times on Moderato (2026-10-08). max(3 ticks, 1.5 %), never past 999.
 */
export function leadTicks(ownTicks: number): number {
  return Math.min(999 - ownTicks, Math.max(3, Math.ceil(ownTicks * 0.015)));
}
