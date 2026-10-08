// Ported from Owarine ecb7565b:web/src/features/terminal/useTerminalWindow.ts (`pickWindow`, `lanesFor`) — Mitoshi's
// lanes are (basis, cadence) pairs (`groupIntoLanes`), Windows run back to back on a lane, and readiness comes from the
// Window's own phase rather than a ladder's "quoting" flag. Pure.
import { laneLabel, type EventMarket, type LaneBasis, type LaneSet } from "@cwf/core";
import { noEntryCutoffSec } from "@cwf/core/lifecycle";
import { laneTabKey, type LaneTabKey } from "@/features/markets/data/lane-view";

/** One lane the symbol trades on: which Window length, on which feed (Regular, 24/7, the weekend Gap). */
export interface TerminalLane {
  key: LaneTabKey;
  basis: LaneBasis;
  intervalSec: number;
  label: string;
}

/** The order lanes are offered in: the session's Regular Windows, then the 24/7 ones, then the week-long Gap. */
const BASIS_ORDER: Record<LaneBasis, number> = { regular: 0, crypto24: 1, stock24: 1, gap: 2 };

const live = (m: EventMarket, nowSec: number) => m.state === "open" && m.expirySec > nowSec;
const trading = (m: EventMarket, nowSec: number) => m.tradingStartSec <= nowSec && nowSec < m.lockAtSec;
const enterable = (m: EventMarket, nowSec: number) => trading(m, nowSec) && nowSec < noEntryCutoffSec(m);

/** The lanes carrying `asset` with a Window still to trade, in offer order, shortest first within a basis. */
export function lanesFor(set: LaneSet | null, asset: string, nowSec: number): TerminalLane[] {
  const out: TerminalLane[] = [];
  for (const lane of set?.lanes ?? []) {
    if (!lane.markets.some((m) => m.asset === asset && live(m, nowSec))) continue;
    out.push({ key: laneTabKey(lane.basis, lane.intervalSec), basis: lane.basis, intervalSec: lane.intervalSec, label: laneLabel(lane.basis, lane.intervalSec) });
  }
  return out.sort((a, b) => BASIS_ORDER[a.basis] - BASIS_ORDER[b.basis] || a.intervalSec - b.intervalSec);
}

/** A lane's Windows for one asset. */
export function laneMarkets(set: LaneSet | null, key: LaneTabKey, asset: string): EventMarket[] {
  const lane = set?.lanes.find((l) => laneTabKey(l.basis, l.intervalSec) === key);
  return lane ? lane.markets.filter((m) => m.asset === asset) : [];
}

/**
 * The Window to show on a lane: the one trading now (the most time left, should two overlap); with none trading, the
 * soonest still to start (a prelisted Window — the scheduled-call state, D-088). Inside a Window's last 30 s the
 * screen stays on it ("closes in…") rather than moving into the next one's resting call: one tap means a fill.
 */
export function pickWindow(markets: readonly EventMarket[], nowSec: number): EventMarket | null {
  const alive = markets.filter((m) => live(m, nowSec));
  const now = alive.filter((m) => trading(m, nowSec)).sort((a, b) => b.expirySec - a.expirySec);
  if (now[0]) return now[0];
  return alive.filter((m) => m.tradingStartSec > nowSec).sort((a, b) => a.tradingStartSec - b.tradingStartSec)[0] ?? null;
}

/**
 * The lane a symbol opens on: the asked one when it still lists a Window; else the first lane, in offer order, with a
 * Window open for entry now (Regular in NYSE hours, 24/7 off-hours and at weekends, the 5m crypto lane); else the
 * first lane listing anything.
 */
export function defaultLane(set: LaneSet | null, asset: string, nowSec: number, asked: LaneTabKey | null): TerminalLane | null {
  const lanes = lanesFor(set, asset, nowSec);
  const askedLane = asked ? lanes.find((l) => l.key === asked) : undefined;
  if (askedLane) return askedLane;
  return lanes.find((l) => laneMarkets(set, l.key, asset).some((m) => enterable(m, nowSec))) ?? lanes[0] ?? null;
}
