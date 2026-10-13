/**
 * The roller's paused tickers in one lane and their words (Ported from Owarine 90a91d71:web/src/features/markets/lanes/
 * next-window.ts `pausedInLane` and lane-view.ts `pausedCopy`, R4-3 D-227), on Mitoshi's `/session` lane states
 * (`paused: no signed source (<why>)`, `paused: corporate action (<what>)`, `paused: halted (<reason>)`). A Regular lane
 * says nothing while the session is closed (every ticker is closed, not paused); the board's merged 24/7 lane reads both
 * its coin and its 24/7 stock keys. Pure.
 */
import { HALT_REASONS, haltLabel, isAllHoursLane, laneKey, laneListable, TICKER_SYMBOLS, type HaltReason, type Lane, type TickerSymbol } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { LANE_CARD } from "../copy";

const HALTED = /^paused: halted \(([a-z-]+)\)/;
const SOURCE_WHY = /^paused: no signed source \((.+)\)$/;

export function pausedInLane(session: { lanes: Readonly<Record<string, string>>; open: boolean } | null, lane: Pick<Lane, "basis" | "intervalSec">): Map<TickerSymbol, string> {
  const paused = new Map<TickerSymbol, string>();
  if (!session || (lane.basis === "regular" && !session.open)) return paused;
  const bases = isAllHoursLane(lane.basis) ? (["crypto24", "stock24"] as const) : [lane.basis];
  for (const symbol of TICKER_SYMBOLS) {
    for (const basis of bases) {
      if (!laneListable(symbol, basis)) continue;
      const state = session.lanes[laneKey(symbol, basis, lane.intervalSec)];
      if (state?.startsWith("paused")) paused.set(symbol, state);
    }
  }
  return paused;
}

/** A `paused: …` state → the card's headline and why: a halt by its label, a corporate action, or no signed source. */
export function pausedCopy(state: string, asset: string, intervalSec: number): { headline: string; why: string } {
  const cadence = formatCadence(intervalSec);
  const reason = HALTED.exec(state)?.[1];
  if (reason && (HALT_REASONS as readonly string[]).includes(reason)) return { headline: haltLabel(reason as HaltReason), why: LANE_CARD.paused.haltWhy(asset, cadence) };
  if (state.startsWith("paused: corporate action")) return { headline: LANE_CARD.paused.corporate, why: LANE_CARD.paused.why(asset, cadence) };
  const sourceWhy = SOURCE_WHY.exec(state)?.[1] ?? null;
  return { headline: LANE_CARD.paused.noSource, why: sourceWhy ? `${LANE_CARD.paused.why(asset, cadence)} ${LANE_CARD.paused.reason(sourceWhy)}` : LANE_CARD.paused.why(asset, cadence) };
}
