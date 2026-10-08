"use client";
// One position's live value (S23d, D-197): the exit read on the live book every 5 s (and on book events), repriced on
// the display spot between reads (`position-value.ts`), with what Close needs: the read exit and whether the Window
// still takes a sale. A Boost's value is the reserve's mark (`markOf`, rested depth) less what it fronted — what its
// Close pays the owner — on the same reprice; its knock-out line is drawn in spot terms.
import { isOk, type ExitQuote, type Hex } from "@cwf/core";
import { getLeverageMark } from "@cwf/markets/leverage";
import { readFairModels } from "@cwf/markets/parlay";
import { useExitQuote, useMarket, useOpeningPrice, useReadingQuery } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { useClockValue } from "@/lib/clock";
import { useCommittedSpot } from "./live";
import { breakEvenSpotE8, liveValue, pnlOf, spotForValueE8, valueAtSpotBase } from "./position-value";
import { BOOST_KEYS, type TerminalPosition } from "./terminal-positions";

export const EXIT_READ_MS = 5_000;

export interface PositionValue {
  exit: ExitQuote | null;
  valueBase: bigint | null;
  pnlBase: bigint | null;
  roiBps: number | null;
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
  /** The model both ways (the TP/SL drawer's linked inputs): what Close pays at a spot, and the spot where it pays a value. */
  valueAt: (spot: number) => bigint | null;
  spotAt: (base: bigint) => number | null;
  /** A Boost's knock-out line in spot terms ("KO ≈"); null otherwise. */
  koSpot: number | null;
}

const none = () => null;
const toE8 = (spot: number) => BigInt(Math.round(spot * 1e8));

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
  const reading = useExitQuote({ market: { marketId: p.marketId, decimals: p.decimals }, side: p.side, contractsRaw: p.heldRaw, pollMs: EXIT_READ_MS, enabled: boost === null });
  const markReading = useReadingQuery([...BOOST_KEYS, "mark", boost?.positionId.toString() ?? ""], () => getLeverageMark(boost!.positionId), { enabled: boost !== null, pollMs: EXIT_READ_MS });
  const mark = boost && markReading?.ok ? markReading.value : null;
  const exit = !boost && reading && isOk(reading) ? reading.value : null;
  const nowSec = useClockValue((ms) => Math.floor(ms / 1000));
  const locked = boost ? market !== null && nowSec >= market.lockAtSec : reading !== null && !isOk(reading) && reading.error.kind === "market-not-trading";
  // What the book pays for the whole holding (gross) and whether it fills; a Boost's owner gets it less what was fronted.
  const gross = boost ? (mark && mark.filledRaw > 0n ? { proceedsBase: mark.markBase, partial: mark.filledRaw < p.heldRaw } : null) : exit ? { proceedsBase: exit.proceedsBase, partial: exit.partial } : null;
  const fronted = boost?.frontedBase ?? 0n;
  const spot = useCommittedSpot(p.asset, { seed: false });
  // The display spot at the moment the book was read (a new read is a new object): the reprice's reference.
  const anchorSpot = useRef<{ read: unknown; spotE8: bigint | null }>({ read: null, spotE8: null });
  const read = boost ? mark : exit;
  if (read && read !== anchorSpot.current.read) anchorSpot.current = { read, spotE8: spot.priceE8 };
  return useMemo(() => {
    if (!gross) return { exit: null, valueBase: null, pnlBase: null, roiBps: null, approx: false, locked, partial: false, spot: spot.price, breakEven: null, tpSpot: null, slSpot: null, valueAt: none, spotAt: none, koSpot: null };
    const model = { anchor: { proceedsBase: gross.proceedsBase, spotE8: anchorSpot.current.spotE8 }, side: p.side, openE8, sigmaE8, tauSec: Math.max(0, p.expirySec - nowSec) };
    const v = liveValue({ ...model, spotE8: spot.priceE8 });
    // The owner's share: a Boost repays the reserve first. A partial exit values only what sells, so the cost is
    // taken pro rata and PnL compares like with like.
    const owned = (g: bigint) => (g > fronted ? g - fronted : 0n);
    const valueBase = owned(v.valueBase);
    const costShare = !boost && exit?.partial && p.heldRaw > 0n ? (p.costBase * exit.contractsRaw) / p.heldRaw : p.costBase;
    const { pnlBase, roiBps } = pnlOf(valueBase, costShare);
    const be = breakEvenSpotE8({ ...model, costBase: costShare + fronted });
    const at = (target: bigint | null) => {
      const s = target === null ? null : spotForValueE8({ ...model, targetBase: target + fronted });
      return s === null ? null : Number(s) / 1e8;
    };
    const valueAt = (s: number) => {
      const g = Number.isFinite(s) && s > 0 ? valueAtSpotBase(model, toE8(s)) : null;
      return g === null ? null : owned(g);
    };
    const ko = boost && mark && mark.lineBase > 0n ? spotForValueE8({ ...model, targetBase: mark.lineBase }) : null;
    return { exit, valueBase, pnlBase, roiBps, approx: v.approx, locked, partial: gross.partial, spot: spot.price, breakEven: be === null ? null : Number(be) / 1e8, tpSpot: at(p.tpBase), slSpot: at(p.slBase), valueAt, spotAt: at, koSpot: ko === null ? null : Number(ko) / 1e8 };
  }, [gross?.proceedsBase, gross?.partial, exit, mark, boost, fronted, spot.priceE8, spot.price, openE8, sigmaE8, nowSec, p.side, p.expirySec, p.heldRaw, p.costBase, p.tpBase, p.slBase, locked]);
}
