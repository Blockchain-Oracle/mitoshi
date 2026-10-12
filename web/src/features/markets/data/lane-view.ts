/**
 * How a lane reads (Ported from Agari 03b30ab:web/src/features/markets/lanes/lane-view.ts, the tab key and label half):
 * one lane per (basis, cadence) exactly as core `groupIntoLanes` keys it, so a 5m session lane and a 5m 24/7 lane
 * stay apart — they price different feeds. Pure.
 */
import { laneLabel, LANE_BASES, type EventMarket, type Lane, type LaneBasis } from "@cwf/core";

export type LaneTabKey = `${LaneBasis}:${number}`;

export const laneTabKey = (basis: LaneBasis, intervalSec: number): LaneTabKey => `${basis}:${intervalSec}`;
export const laneKeyOf = (lane: Pick<Lane, "basis" | "intervalSec">): LaneTabKey => laneTabKey(lane.basis, lane.intervalSec);

const KEY_RE = new RegExp(`^(${LANE_BASES.join("|")}):(\\d+)$`);

export function parseLaneTabKey(raw: string): LaneTabKey | null {
  const match = KEY_RE.exec(raw);
  return match ? laneTabKey(match[1] as LaneBasis, Number(match[2])) : null;
}

export function laneTabParts(key: LaneTabKey): { basis: LaneBasis; intervalSec: number } {
  const [basis, interval] = key.split(":") as [LaneBasis, string];
  return { basis, intervalSec: Number(interval) };
}

export function laneTabLabel(key: LaneTabKey): string {
  const { basis, intervalSec } = laneTabParts(key);
  return basis === "crypto24" ? `${laneLabel(basis, intervalSec)} · Crypto` : laneLabel(basis, intervalSec);
}

/** The tickers a lane lists, in board order (first expiry first). */
export function laneTickers(lane: Lane): string[] {
  return [...new Set(lane.markets.map((m) => m.asset))];
}

export function tickerMarkets(lane: Lane, ticker: string | null): EventMarket[] {
  return ticker === null ? lane.markets : lane.markets.filter((m) => m.asset === ticker);
}
