/**
 * A position's live value (S23d, D-197): what CLOSE pays. The anchor is the last book read — `ExitQuote.proceedsBase`
 * for the held size, walked on the live book (re-read every 5 s and on book events). Between reads the anchor moves
 * with the Window's fair probability on the display spot (`fairProbUpE6`, the guard's σ for the Series): an adverse
 * move shows at once; a favourable one waits for the next read — the shown value is never more than the book last
 * paid, so it never promises what Close can't fill. A repriced value is marked "≈". Integers in, integers out.
 */
import { fairProbUpE6, fairSideProbE6, type ExitQuote, type Side } from "@cwf/core";
import { likeForLikeBase } from "@cwf/core/exits";

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

/*
 * What a position is worth (D-227; Owarine 90a91d71 `position-value.ts` `positionValueBase`, `live-exit.ts` `livePnl`):
 * P&L is what Close pays now — the bid walk — less the open cost of what that sale would take; once the Window has
 * its answer it is the known payout (a dollar a contract if won, 0 if lost, half if void) less the open cost. Equity
 * counts the part the book takes at what it pays and the rest at its cost (locked, no bids, a thin book), so a
 * position never leaves equity at the lock and comes back at the payout. Integers in, integers out.
 */

/** The share of the open cost that `soldRaw` of `heldRaw` carries (pro rata); all of it when the sale is the whole. */
export function costShareOf(costBase: bigint, soldRaw: bigint, heldRaw: bigint): bigint {
  if (heldRaw <= 0n || soldRaw >= heldRaw) return costBase;
  return soldRaw <= 0n ? 0n : (costBase * soldRaw) / heldRaw;
}

/** Owarine's `positionValueBase`: Close's proceeds for the fillable lots plus the rest at cost; nothing fillable is cost. */
export function positionValueBase(costBase: bigint, heldRaw: bigint, fillableRaw: bigint, valueBase: bigint | null): bigint {
  if (valueBase === null || heldRaw <= 0n || fillableRaw <= 0n) return costBase;
  if (fillableRaw >= heldRaw) return valueBase;
  return valueBase + (costBase * (heldRaw - fillableRaw)) / heldRaw;
}

/** What a settled Window pays the held side: one collateral unit a contract if it won, none if it lost, half if void. */
export function settledPayoutBase(side: Side, heldRaw: bigint, state: "resolved" | "voided", winningOutcome: 0 | 1 | null): bigint {
  if (state === "voided") return heldRaw / 2n;
  return winningOutcome !== null && (winningOutcome === 0) === (side === "up") ? heldRaw : 0n;
}

/** The walk's own price a contract, in ticks of 0.1¢ (Owarine's `upPriceTicks`): proceeds × 1000 ÷ contracts. */
export const walkTicksOf = (proceedsBase: bigint, contractsRaw: bigint): number | null => (contractsRaw > 0n ? Number((proceedsBase * 1_000n) / contractsRaw) : null);

export interface Worth {
  /** What Close pays now (the owner's share for a Boost); for a settled Window, its payout. */
  valueBase: bigint;
  pnlBase: bigint;
  /** The open cost the P&L is taken against (the fillable part's on a thin book). */
  costShareBase: bigint;
  /** ROI's denominator: the cost share, or a Boost's stake share (D-227: a Boost's ROI stays on its stake). */
  roiCostBase: bigint;
  /** What it counts for in equity: the fillable part at its value, the rest at cost. */
  equityBase: bigint;
  /** The whole holding at the walk's price: what take-profit and stop-loss compare (like for like). */
  triggerValueBase: bigint | null;
  /** Percent of the holding the book takes now; 100 when whole. */
  fillablePct: number;
}

/** A wallet, Trading Balance or DEMO position on the exit walk: `valueBase` is the walk's proceeds for `contractsRaw`, repriced. */
export function walkWorth(i: { valueBase: bigint; contractsRaw: bigint; heldRaw: bigint; costBase: bigint }): Worth {
  const sold = i.contractsRaw < i.heldRaw ? i.contractsRaw : i.heldRaw;
  const costShareBase = costShareOf(i.costBase, sold, i.heldRaw);
  return {
    valueBase: i.valueBase, pnlBase: i.valueBase - costShareBase, costShareBase, roiCostBase: costShareBase,
    equityBase: positionValueBase(i.costBase, i.heldRaw, sold, i.valueBase), triggerValueBase: likeForLikeBase(i.valueBase, sold, i.heldRaw),
    fillablePct: i.heldRaw > 0n ? Number((sold * 100n) / i.heldRaw) : 0,
  };
}

/**
 * A Boost on the reserve's mark (`markOf`: rested depth for `filledRaw` of `heldRaw`). Close sells what fills and repays
 * the reserve first, so it pays the owner `max(0, mark − fronted)`; P&L compares like with like — the filled part's mark
 * against its share of the front and of the open cost (`stake − returned`), the owner never losing more than that cost.
 */
export function boostWorth(i: { markBase: bigint; filledRaw: bigint; heldRaw: bigint; frontedBase: bigint; costBase: bigint; stakeBase: bigint }): Worth {
  const filled = i.filledRaw < i.heldRaw ? i.filledRaw : i.heldRaw;
  const owner = (g: bigint, front: bigint) => (g > front ? g - front : 0n);
  const costShareBase = costShareOf(i.costBase, filled, i.heldRaw);
  const ownerShare = owner(i.markBase, costShareOf(i.frontedBase, filled, i.heldRaw));
  const whole = likeForLikeBase(i.markBase, filled, i.heldRaw);
  return {
    valueBase: owner(i.markBase, i.frontedBase), pnlBase: ownerShare - costShareBase, costShareBase, roiCostBase: costShareOf(i.stakeBase, filled, i.heldRaw),
    // The unfilled rest at cost — never below zero: a Boost that already paid back more than its stake owes nothing.
    equityBase: ownerShare + (i.costBase > costShareBase ? i.costBase - costShareBase : 0n), triggerValueBase: whole === null ? null : owner(whole, i.frontedBase),
    fillablePct: i.heldRaw > 0n ? Number((filled * 100n) / i.heldRaw) : 0,
  };
}

/** A position whose Window has its answer: worth the payout, against all of its open cost (a Boost's payout less its front). */
export function settledWorth(i: { payoutBase: bigint; costBase: bigint; roiCostBase: bigint }): Worth {
  return { valueBase: i.payoutBase, pnlBase: i.payoutBase - i.costBase, costShareBase: i.costBase, roiCostBase: i.roiCostBase, equityBase: i.payoutBase, triggerValueBase: null, fillablePct: 0 };
}

/** A Boost's payout on a settled Window (`LeverageMath.winIfRight`, the void at half): the reserve's front comes out first. */
export function boostPayoutBase(side: Side, quantityRaw: bigint, frontedBase: bigint, state: "resolved" | "voided", winningOutcome: 0 | 1 | null): bigint {
  const gross = settledPayoutBase(side, quantityRaw, state, winningOutcome);
  return gross > frontedBase ? gross - frontedBase : 0n;
}

/** What a right call pays a dollar in: the contracts (a Boost's less the reserve's front) over what is still in. */
export function paysMultiple(p: { heldRaw: bigint; costBase: bigint; boost?: { frontedBase: bigint } }): number | null {
  const gets = p.boost ? p.heldRaw - p.boost.frontedBase : p.heldRaw;
  return p.costBase > 0n && gets > 0n ? Number((gets * 1_000n) / p.costBase) / 1_000 : null;
}

/** Avg in, in ticks of 0.1¢: open cost ÷ contracts, or a Boost's own entry price (its stake is a fraction of the cost). */
export const avgTicksOf = (p: { heldRaw: bigint; costBase: bigint; boost?: { entryPriceRaw: bigint } }): number | null =>
  p.boost ? Number(p.boost.entryPriceRaw / 1_000n) : p.heldRaw > 0n ? Number((p.costBase * 1_000n) / p.heldRaw) : null;

/**
 * The spot where several positions on one Window and side together pay `targetBase` — their combined break-even (the
 * chart's one B/E line for a wallet row, a Trading Balance row and a Boost on the same Window). Each `valueAt` is a
 * row's whole-holding value at a spot; bisection within ±10 % of `spot`, as `spotForValueE8`. Null when a row has no
 * model or no spot in range reaches it.
 */
export function combinedSpotFor(valueAt: readonly ((spot: number) => bigint | null)[], targetBase: bigint, spot: number | null, side: Side): number | null {
  if (valueAt.length === 0 || spot === null || !(spot > 0) || targetBase <= 0n) return null;
  const f = (s: number): bigint | null => {
    let sum = 0n;
    for (const at of valueAt) {
      const x = at(s);
      if (x === null) return null;
      sum += x;
    }
    return side === "up" ? sum - targetBase : targetBase - sum;
  };
  let lo = spot * 0.9;
  let hi = spot * 1.1;
  const fLo = f(lo);
  const fHi = f(hi);
  if (fLo === null || fHi === null || fLo > 0n || fHi < 0n) return null;
  for (let k = 0; k < 26; k++) {
    const mid = (lo + hi) / 2;
    const m = f(mid);
    if (m === null) return null;
    if (m < 0n) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * A paper Close on the live book's exit (D-227, as live): it sells what the walk fills — on a thin book less than asked
 * — costs that part pro rata and keeps the rest open at the rest of the cost; `keep` is absent when nothing is left.
 */
export function paperClose(p: { heldRaw: bigint; costBase: bigint }, exit: Pick<ExitQuote, "contractsRaw" | "proceedsBase">): { costShareBase: bigint; pnlBase: bigint; keep?: { contractsRaw: bigint; costBase: bigint } } {
  const sold = exit.contractsRaw < p.heldRaw ? exit.contractsRaw : p.heldRaw;
  const costShareBase = sold >= p.heldRaw || p.heldRaw === 0n ? p.costBase : (p.costBase * sold) / p.heldRaw;
  const left = p.heldRaw - sold;
  return { costShareBase, pnlBase: exit.proceedsBase - costShareBase, ...(left > 0n ? { keep: { contractsRaw: left, costBase: p.costBase - costShareBase } } : {}) };
}

// The rules themselves are shared with the exit keeper (S24.3): one copy in `@cwf/core/exits`.
export { exitHit, likeForLikeBase, ratchet, trailEligible, trailHit, trailStart } from "@cwf/core/exits";
