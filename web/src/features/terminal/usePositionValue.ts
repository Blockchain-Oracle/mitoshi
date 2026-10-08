"use client";
// One position's live value (S23d, D-197): the exit read on the live book every 5 s (and on book events), repriced on
// the display spot between reads (`position-value.ts`), with what Close needs: the read exit and whether the Window
// still takes a sale.
import { isOk, type ExitQuote, type Hex } from "@cwf/core";
import { readFairModels } from "@cwf/markets/parlay";
import { useExitQuote, useMarket, useOpeningPrice } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { useClockValue } from "@/lib/clock";
import { useCommittedSpot } from "./live";
import { breakEvenSpotE8, liveValue, pnlOf } from "./position-value";
import type { TerminalPosition } from "./terminal-positions";

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
}

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
  const reading = useExitQuote({ market: { marketId: p.marketId, decimals: p.decimals }, side: p.side, contractsRaw: p.heldRaw, pollMs: EXIT_READ_MS });
  const exit = reading && isOk(reading) ? reading.value : null;
  const locked = reading !== null && !isOk(reading) && reading.error.kind === "market-not-trading";
  const spot = useCommittedSpot(p.asset, { seed: false });
  // The display spot at the moment the book was read: the reprice's reference.
  const anchorSpot = useRef<{ at: number; spotE8: bigint | null }>({ at: 0, spotE8: null });
  if (exit && exit.quotedAtMs !== anchorSpot.current.at) anchorSpot.current = { at: exit.quotedAtMs, spotE8: spot.priceE8 };
  const nowSec = useClockValue((ms) => Math.floor(ms / 1000));
  return useMemo(() => {
    if (!exit) return { exit: null, valueBase: null, pnlBase: null, roiBps: null, approx: false, locked, partial: false, spot: spot.price, breakEven: null };
    const v = liveValue({ anchor: { proceedsBase: exit.proceedsBase, spotE8: anchorSpot.current.spotE8 }, side: p.side, spotE8: spot.priceE8, openE8, sigmaE8, tauSec: Math.max(0, p.expirySec - nowSec) });
    // A partial exit values only what sells: cost is taken pro rata so PnL compares like with like.
    const costShare = exit.partial && p.heldRaw > 0n ? (p.costBase * exit.contractsRaw) / p.heldRaw : p.costBase;
    const { pnlBase, roiBps } = pnlOf(v.valueBase, costShare);
    const be = breakEvenSpotE8({ anchor: { proceedsBase: exit.proceedsBase, spotE8: anchorSpot.current.spotE8 }, costBase: costShare, side: p.side, openE8, sigmaE8, tauSec: Math.max(0, p.expirySec - nowSec) });
    return { exit, valueBase: v.valueBase, pnlBase, roiBps, approx: v.approx, locked, partial: exit.partial, spot: spot.price, breakEven: be === null ? null : Number(be) / 1e8 };
  }, [exit, spot.priceE8, spot.price, openE8, sigmaE8, nowSec, p.side, p.expirySec, p.heldRaw, p.costBase, locked]);
}
