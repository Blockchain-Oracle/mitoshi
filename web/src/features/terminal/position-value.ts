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

/**
 * The spot at which Close would pay the position's cost back (its break-even), on the same model as the reprice:
 * `value(spot) = anchor × p(spot) ÷ p(anchor spot)`, solved for `value = cost` by bisection within ±10 % of the
 * anchor spot (26 halvings: well under a cent). Null without the model's inputs or when no spot in range breaks even.
 */
export function breakEvenSpotE8(i: { anchor: ValueAnchor; costBase: bigint; side: Side; openE8: bigint | null; sigmaE8: bigint | null; tauSec: number }): bigint | null {
  return spotForValueE8({ ...i, targetBase: i.costBase });
}

export interface ValueModel {
  anchor: ValueAnchor;
  side: Side;
  openE8: bigint | null;
  sigmaE8: bigint | null;
  tauSec: number;
}

/**
 * What Close would pay with the asset at `spotE8`, on the reprice model and uncapped — a target's value, not a promise
 * (the TP/SL drawer's trigger price → exit value). Null without the model's inputs.
 */
export function valueAtSpotBase(i: ValueModel, spotE8: bigint): bigint | null {
  if (i.anchor.spotE8 === null || i.openE8 === null || !i.sigmaE8 || i.anchor.proceedsBase <= 0n || spotE8 <= 0n) return null;
  const outcome = i.side === "up" ? 0 : 1;
  try {
    const at = fairSideProbE6(fairProbUpE6(i.anchor.spotE8, i.openE8, i.sigmaE8, i.tauSec), outcome);
    if (at <= 0n) return null;
    return (i.anchor.proceedsBase * fairSideProbE6(fairProbUpE6(spotE8, i.openE8, i.sigmaE8, i.tauSec), outcome)) / at;
  } catch {
    return null;
  }
}

/**
 * The spot at which Close would pay `targetBase` (a take-profit or stop-loss drawn on the chart, "≈"), on the same model
 * and within the same ±10 % bracket as break-even. Null without the inputs or when no spot in range reaches it.
 */
export function spotForValueE8(i: { anchor: ValueAnchor; targetBase: bigint; side: Side; openE8: bigint | null; sigmaE8: bigint | null; tauSec: number }): bigint | null {
  const { anchor } = i;
  const costBase = i.targetBase;
  if (anchor.spotE8 === null || i.openE8 === null || !i.sigmaE8 || anchor.proceedsBase <= 0n || costBase <= 0n) return null;
  const outcome = i.side === "up" ? 0 : 1;
  const prob = (spotE8: bigint) => fairSideProbE6(fairProbUpE6(spotE8, i.openE8!, i.sigmaE8!, i.tauSec), outcome);
  try {
    const at = prob(anchor.spotE8);
    if (at <= 0n) return null;
    const value = (spotE8: bigint) => (anchor.proceedsBase * prob(spotE8)) / at;
    let lo = (anchor.spotE8 * 90n) / 100n;
    let hi = (anchor.spotE8 * 110n) / 100n;
    // Value rises with the spot for Up and falls for Down: orient so f(lo) < 0 < f(hi).
    const f = (s: bigint) => (i.side === "up" ? value(s) - costBase : costBase - value(s));
    if (f(lo) > 0n || f(hi) < 0n) return null;
    for (let k = 0; k < 26; k++) {
      const mid = (lo + hi) / 2n;
      if (f(mid) < 0n) lo = mid;
      else hi = mid;
    }
    return hi;
  } catch {
    return null;
  }
}

// The rules themselves are shared with the exit keeper (S24.3): one copy in `@cwf/core/exits`.
export { exitHit, ratchet, trailEligible, trailHit, trailStart } from "@cwf/core/exits";
