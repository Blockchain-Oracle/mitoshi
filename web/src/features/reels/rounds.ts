"use client";
// Ported from Agari 03b30ab:web/src/features/markets/reels/useReelRounds.ts (S13 step 9) — Windows in the reel: the
// soonest still in the reel per asset and lane, soonest close first, capped; membership from core's `phase()`.
import { isEnterable, phase, type MarketPhase } from "@cwf/core/lifecycle";
import type { EventMarket, LaneSet } from "@cwf/core";
import { useRef } from "react";

const IN_REEL: ReadonlySet<MarketPhase> = new Set<MarketPhase>(["pendingOpeningPrint", "trading", "noEntryBuffer"]);
/** Every asset × every lane, never a feed of a hundred cards. */
export const REEL_CAP = 12;

/** True once the Window stops taking entries: the card keeps its frame and says so. */
export const isClosing = (market: EventMarket, nowMs: number): boolean => {
  const p = phase(market, nowMs);
  return !isEnterable(p) && IN_REEL.has(p);
};

export function soonestPerAssetAndLane(laneSet: LaneSet, nowMs: number): EventMarket[] {
  const out: EventMarket[] = [];
  for (const lane of laneSet.lanes) {
    const seen = new Set<string>();
    for (const market of [...lane.markets].sort((a, b) => a.expirySec - b.expirySec)) {
      if (seen.has(market.asset) || !IN_REEL.has(phase(market, nowMs))) continue;
      seen.add(market.asset);
      out.push(market);
    }
  }
  return out.sort((a, b) => a.expirySec - b.expirySec).slice(0, REEL_CAP);
}

const sameIds = (a: readonly EventMarket[], b: readonly EventMarket[]) => a.length === b.length && a.every((m, i) => m.marketId === b[i]!.marketId);

/**
 * The clock ticks every second, so a recomputed list would remount every card each second: the previous array is kept
 * while membership and order are unchanged, and only while it came from the lane set still in hand.
 */
export function useReelRounds(laneSet: LaneSet | null, nowMs: number): EventMarket[] {
  const held = useRef<{ from: LaneSet | null; rounds: EventMarket[] }>({ from: null, rounds: [] });
  const next = laneSet === null || nowMs === 0 ? [] : soonestPerAssetAndLane(laneSet, nowMs);
  if (held.current.from !== laneSet || !sameIds(held.current.rounds, next)) held.current = { from: laneSet, rounds: next };
  return held.current.rounds;
}
