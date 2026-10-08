/**
 * A position's live value (S23d, D-197): what CLOSE pays. The anchor is the last book read — `ExitQuote.proceedsBase`
 * for the held size, walked on the live book (re-read every 5 s and on book events). Between reads the anchor moves
 * with the Window's fair probability on the display spot (`fairProbUpE6`, the guard's σ for the Series): an adverse
 * move shows at once; a favourable one waits for the next read — the shown value is never more than the book last
 * paid, so it never promises what Close can't fill. A repriced value is marked "≈". Integers in, integers out.
 */
import { fairProbUpE6, fairSideProbE6, type Side } from "@cwf/core";

export interface ValueAnchor {
  proceedsBase: bigint;
  /** The display spot when the book was read. */
  spotE8: bigint | null;
}

export interface LiveValueInput {
  anchor: ValueAnchor;
  side: Side;
  spotE8: bigint | null;
  /** The Window's opening print (the line). */
  openE8: bigint | null;
  sigmaE8: bigint | null;
  /** Seconds to the close print on the Series' clock. */
  tauSec: number;
}

export interface LiveValue {
  valueBase: bigint;
  /** Repriced since the book read (shown "≈"). */
  approx: boolean;
}

export function liveValue(i: LiveValueInput): LiveValue {
  const { anchor } = i;
  const same = { valueBase: anchor.proceedsBase, approx: false };
  if (i.spotE8 === null || anchor.spotE8 === null || i.openE8 === null || !i.sigmaE8 || i.spotE8 === anchor.spotE8 || anchor.proceedsBase === 0n) return same;
  try {
    const outcome = i.side === "up" ? 0 : 1;
    const at = fairSideProbE6(fairProbUpE6(anchor.spotE8, i.openE8, i.sigmaE8, i.tauSec), outcome);
    const now = fairSideProbE6(fairProbUpE6(i.spotE8, i.openE8, i.sigmaE8, i.tauSec), outcome);
    if (at <= 0n) return same;
    const repriced = (anchor.proceedsBase * now) / at;
    return { valueBase: repriced < anchor.proceedsBase ? repriced : anchor.proceedsBase, approx: repriced < anchor.proceedsBase };
  } catch {
    return same;
  }
}

/** PnL and ROI (bps) of a value against what the position cost. */
export function pnlOf(valueBase: bigint, costBase: bigint): { pnlBase: bigint; roiBps: number | null } {
  const pnlBase = valueBase - costBase;
  return { pnlBase, roiBps: costBase > 0n ? Number((pnlBase * 10_000n) / costBase) : null };
}

/** The one-tap Close floor (D-197): the book's own floor less the user's close tolerance — never the reprice. */
export function closeFloorBase(minProceedsBase: bigint, toleranceBps: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.round(toleranceBps))));
  return (minProceedsBase * (10_000n - bps)) / 10_000n;
}
