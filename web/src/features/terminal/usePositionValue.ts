"use client";
// One position's live value (S23d, D-197): the exit read on the live book every 5 s (and on book events), repriced on
// the display spot between reads (`position-value.ts`), with what Close needs: the read exit and whether the Window
// still takes a sale. A Boost's value is the reserve's mark (`markOf`, rested depth) less what it fronted — what its
// Close pays the owner — on the same reprice; its knock-out line is drawn in spot terms. D-227 (Owarine 90a91d71
// `livePnl`, `positionValueBase`, `positionReturn`): P&L against the open cost of the part the book takes, the known
// payout once the Window answered (a Boost's too — no book mark after the lock), equity with the rest at cost, a status
// for every row, and the trigger value TP/SL compare like for like. /portfolio reads the same hook.
import { isOk, type ExitQuote, type Hex } from "@cwf/core";
import { getLeverageMark } from "@cwf/markets/leverage";
import { readFairModels } from "@cwf/markets/parlay";
import { useExitQuote, useMarket, useOpeningPrice, useReadingQuery } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { useClockValue } from "@/lib/clock";
import { useCommittedSpot } from "./live";
import { boostPayoutBase, boostWorth, breakEvenSpotE8, costShareOf, likeForLikeBase, liveValue, settledPayoutBase, settledWorth, spotForValueE8, valueAtSpotBase, walkTicksOf, walkWorth, type Worth } from "./position-value";
import { isPriced, type PositionStatus } from "./position-return";
import { BOOST_KEYS, type TerminalPosition } from "./terminal-positions";

export const EXIT_READ_MS = 5_000;

export interface PositionValue {
  exit: ExitQuote | null;
  /** Why the row has the number it has, or none (`position-return.ts`). */
  status: PositionStatus;
  /** What Close pays now (a Boost: the owner's share); a settled Window: its payout. Null when nothing prices it. */
  valueBase: bigint | null;
  /** P&L and ROI on a priced row only: what Close pays less the open cost of what it sells. */
  pnlBase: bigint | null;
  roiBps: number | null;
  /** The cost that P&L is taken against, and ROI's denominator (a Boost's stake share); null unpriced. */
  costShareBase: bigint | null;
  roiCostBase: bigint | null;
  /** What the row counts for in equity: always a figure — the rest at cost when the book takes none or part. */
  equityBase: bigint;
  /** The whole holding at the walk's price: what TP and SL compare (like for like). */
  triggerValueBase: bigint | null;
  /** The walk's price a contract (ticks of 0.1¢), and how much of the holding the book takes now (%). */
  nowTicks: number | null;
  fillablePct: number | null;
  approx: boolean;
  /** The Window stopped taking sales: it pays at its close. */
  locked: boolean;
  /** Close can sell only part (the book is thin): the value is what that part pays. */
  partial: boolean;
  /** The display spot of the position's asset, and the spot where Close pays the cost back (Trail's reference). */
  spot: number | null;
  breakEven: number | null;
  /** Where the take-profit and stop-loss sit in spot terms on the same model ("≈" on the chart). */
  tpSpot: number | null;
  slSpot: number | null;
  /** The model both ways (the TP/SL drawer's linked inputs): what the whole holding pays at a spot, and the spot for a value. */
  valueAt: (spot: number) => bigint | null;
  spotAt: (base: bigint) => number | null;
  /** A Boost's knock-out line in spot terms ("KO ≈"); null otherwise. */
  koSpot: number | null;
  /** The Window has an answer: resolved (the settler pays the right side) or voided (both sides returned at half). */
  settled: "resolved" | "voided" | null;
}

const none = () => null;
const toE8 = (spot: number) => BigInt(Math.round(spot * 1e8));
const e8ToSpot = (s: bigint | null) => (s === null ? null : Number(s) / 1e8);

export function usePositionValue(p: TerminalPosition): PositionValue {
  const marketReading = useMarket(p.marketId);
  const market = marketReading && isOk(marketReading) ? marketReading.value : null;
  const opening = useOpeningPrice(p.marketId);
  const openE8 = opening && isOk(opening) ? opening.value : (market?.openingPriceRaw ?? null);
  const models = useQuery({
    queryKey: ["cwf", "terminal", "fair-model", market?.seriesId ?? null],
    queryFn: () => readFairModels([market!.seriesId as Hex]),
    enabled: market !== null,
    staleTime: 5 * 60_000,
  });
  const sigmaE8 = market ? (models.data?.get(market.seriesId.toLowerCase())?.sigmaE8 ?? null) : null;
  const boost = p.boost ?? null;
  const nowSec = useClockValue((ms) => Math.floor(ms / 1000));
  const settled = market && market.state !== "open" ? market.state : null;
  const winner = market?.winningOutcome ?? null;
  const pastLock = market !== null && nowSec >= market.lockAtSec;
  const reading = useExitQuote({ market: { marketId: p.marketId, decimals: p.decimals }, side: p.side, contractsRaw: p.heldRaw, pollMs: EXIT_READ_MS, enabled: boost === null && settled === null });
  // A Boost's mark is a book read: never after the lock, when the Window pays at its close (D-227).
  const markReading = useReadingQuery([...BOOST_KEYS, "mark", boost?.positionId.toString() ?? ""], () => getLeverageMark(boost!.positionId), { enabled: boost !== null && !pastLock && settled === null, pollMs: EXIT_READ_MS });
  const mark = boost && markReading?.ok && !pastLock && settled === null ? markReading.value : null;
  const exit = !boost && settled === null && reading && isOk(reading) ? reading.value : null;
  const locked = settled !== null || pastLock || (!boost && reading !== null && !isOk(reading) && reading.error.kind === "market-not-trading");
  const noBids = boost ? markReading?.ok === true && markReading.value.filledRaw === 0n : reading !== null && isOk(reading) && reading.value === null;
  // What the book pays for the part it takes (gross) and how many contracts that is.
  const gross = locked ? null : boost ? (mark && mark.filledRaw > 0n ? { proceedsBase: mark.markBase, contractsRaw: mark.filledRaw } : null) : exit ? { proceedsBase: exit.proceedsBase, contractsRaw: exit.contractsRaw } : null;
  const fronted = boost?.frontedBase ?? 0n;
  const spot = useCommittedSpot(p.asset, { seed: false });
  // The display spot at the moment the book was read (a new read is a new object): the reprice's reference.
  const anchorSpot = useRef<{ read: unknown; spotE8: bigint | null }>({ read: null, spotE8: null });
  const read = boost ? mark : exit;
  if (read && read !== anchorSpot.current.read) anchorSpot.current = { read, spotE8: spot.priceE8 };
  return useMemo((): PositionValue => {
    const unpricedCost = p.costBase > 0n ? p.costBase : 0n;
    const base = { exit, valueBase: null, pnlBase: null, roiBps: null, costShareBase: null, roiCostBase: null, equityBase: unpricedCost, triggerValueBase: null, nowTicks: null, fillablePct: null, approx: false, locked, partial: false, spot: spot.price, breakEven: null, tpSpot: null, slSpot: null, valueAt: none, spotAt: none, koSpot: null, settled };
    const stale = p.costStale === true;
    const priced = (w: Worth, status: PositionStatus, extra: Partial<PositionValue> = {}): PositionValue => {
      const show = !stale && isPriced(status);
      return {
        ...base, ...extra, status: stale ? "updating" : status, valueBase: w.valueBase, pnlBase: show ? w.pnlBase : null, roiBps: show && w.roiCostBase > 0n ? Number((w.pnlBase * 10_000n) / w.roiCostBase) : null,
        costShareBase: show ? w.costShareBase : null, roiCostBase: show ? w.roiCostBase : null, equityBase: w.equityBase, triggerValueBase: w.triggerValueBase,
      };
    };
    if (settled !== null) {
      // The Window answered: the known payout (a Boost's less the reserve's front), against all of the open cost.
      const payoutBase = boost ? boostPayoutBase(p.side, p.heldRaw, fronted, settled, winner) : settledPayoutBase(p.side, p.heldRaw, settled, winner);
      return priced(settledWorth({ payoutBase, costBase: p.costBase, roiCostBase: boost ? boost.stakeBase : p.costBase }), "settled");
    }
    if (!gross) return { ...base, status: stale ? "updating" : locked ? (nowSec >= p.expirySec ? "settling" : "locked") : noBids ? "no-bids" : "reading" };
    const model = { anchor: { proceedsBase: gross.proceedsBase, spotE8: anchorSpot.current.spotE8 }, side: p.side, openE8, sigmaE8, tauSec: Math.max(0, p.expirySec - nowSec) };
    const v = liveValue({ ...model, spotE8: spot.priceE8 });
    const filled = gross.contractsRaw < p.heldRaw ? gross.contractsRaw : p.heldRaw;
    const w = boost ? boostWorth({ markBase: v.valueBase, filledRaw: filled, heldRaw: p.heldRaw, frontedBase: fronted, costBase: p.costBase, stakeBase: boost.stakeBase }) : walkWorth({ valueBase: v.valueBase, contractsRaw: filled, heldRaw: p.heldRaw, costBase: p.costBase });
    const partial = filled < p.heldRaw;
    // The model prices the part the book takes; a whole-holding target is that part's share of it (plus its front).
    const part = (whole: bigint) => (partial ? (whole * filled) / p.heldRaw : whole);
    const owned = (g: bigint) => (g > fronted ? g - fronted : 0n);
    const at = (target: bigint | null) => (target === null ? null : e8ToSpot(spotForValueE8({ ...model, targetBase: part(target + fronted) })));
    const valueAt = (s: number) => {
      const g = Number.isFinite(s) && s > 0 ? valueAtSpotBase(model, toE8(s)) : null;
      const whole = g === null ? null : likeForLikeBase(g, filled, p.heldRaw);
      return whole === null ? null : owned(whole);
    };
    const be = breakEvenSpotE8({ ...model, costBase: costShareOf(p.costBase, filled, p.heldRaw) + costShareOf(fronted, filled, p.heldRaw) });
    const ko = boost && markReading?.ok && markReading.value.lineBase > 0n ? spotForValueE8({ ...model, targetBase: part(markReading.value.lineBase) }) : null;
    return priced(w, partial ? "partial" : "priced", {
      approx: v.approx, partial, nowTicks: walkTicksOf(v.valueBase, filled), fillablePct: w.fillablePct,
      breakEven: e8ToSpot(be), tpSpot: at(p.tpBase), slSpot: at(p.slBase), valueAt, spotAt: at, koSpot: e8ToSpot(ko),
    });
  }, [gross?.proceedsBase, gross?.contractsRaw, exit, markReading, boost, fronted, spot.priceE8, spot.price, openE8, sigmaE8, nowSec, p.side, p.expirySec, p.heldRaw, p.costBase, p.costStale, p.tpBase, p.slBase, locked, noBids, settled, winner]);
}
