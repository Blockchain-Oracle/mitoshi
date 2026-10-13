import { isAllHoursLane, type LaneSet } from "@cwf/core";

/**
 * The after-hours fact, read from the lanes (R4-9, D-227; bugs 0 and 1 of the copy spec): while the NYSE is shut the
 * 24/7 lanes — crypto and the stocks with a 24/7 feed — still run. Counts the Windows trading on them now, so the line
 * says what the venue actually has.
 */
export function allDayLive(lanes: LaneSet, nowSec: number): number {
  return lanes.lanes
    .filter((lane) => isAllHoursLane(lane.basis))
    .reduce((n, lane) => n + lane.markets.filter((m) => m.state === "open" && m.tradingStartSec <= nowSec && nowSec < m.lockAtSec).length, 0);
}

/** Every Window trading now, on any lane — the Practice cabinet's live fact. */
export function windowsLive(lanes: LaneSet, nowSec: number): number {
  return lanes.lanes.reduce((n, lane) => n + lane.markets.filter((m) => m.state === "open" && m.tradingStartSec <= nowSec && nowSec < m.lockAtSec).length, 0);
}

/**
 * A practice card's asset is the feed it is scored on (R4-9, D-227): a 24/7 stock Window reads the provider's `-24`
 * feed (`feedKeyOf`), or an after-hours card would be scored on a closed market's frozen print. Shown, it is the ticker.
 */
export const tickerOf = (feed: string): string => feed.replace(/-24$/, "");
export const isAllDayFeed = (feed: string): boolean => feed.endsWith("-24");
