// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/window-roller/{plan,plan-basis}.ts
// (Books gone: the engine's node pool is shared, so a Window never waits for a free Book; Pyth entitlement dropped).
/**
 * What the roller does next on one Regular Series. Pure: plain Series data, the agreed calendar and the chain clock in,
 * one decision out. The executor re-reads before it sends.
 */
import { corporateActionFor, corporatePausedState, haltAssetOf, haltOf, haltPausedState, regularWindows, type BoundaryKind, type CorporateSkip, type HaltBoard, type LaneBasis, type MultiplierChange, type ScheduledWindow, type SessionCalendar, type TickerSymbol } from "@cwf/core";
import { describeVersion, highestCoveringVersion, openPrintsAdmissible, PAUSED_NO_SOURCE, type VersionWindow } from "./versions";

/** `BoundaryKind` as `openWindow` takes it (A.2). */
export const BOUNDARY_KIND_U8: Record<BoundaryKind, number> = { Intraday: 0, SessionOpen: 1, SessionClose: 2 };

export interface PlanSeries {
  /** The lane key: `TSLA-5m`, `TSLA-gap`, `TSLA-24-5m`, `BTC-5m` (core `laneKey`). */
  key: string;
  symbol: TickerSymbol;
  lane: LaneBasis;
  cadenceSec: number;
  /** `series.maxLeadSec`: how far ahead the engine lets this Series list (E-26 step 8). */
  maxLeadSec: number;
  nextIndex: bigint;
  lastExpirySec: number;
  versions: readonly VersionWindow[];
}

export interface PlanClock {
  calendar: SessionCalendar | null;
  /** The chain clock. */
  nowSec: number;
  /** Open a Window at most this long before its trading start (Regular and 24/7 lanes). */
  leadSec: number;
  /** The Gap's listing lead: the Friday Gap lists from Wednesday 16:00 ET. */
  gapLeadSec: number;
  /** Never open a Window with less than this left before `lockAt`. */
  minTradableSec: number;
  /** Prelist the next session's first Regular Window at the previous close (D-089 in Agari). */
  prelist: boolean;
  prelistCadencesSec: readonly number[];
  skips: readonly CorporateSkip[];
  multipliers: readonly MultiplierChange[];
  halts: HaltBoard;
}

export type SeriesPlan =
  | { kind: "open"; window: ScheduledWindow; index: bigint; policyVersion: number; openKind: number; closeKind: number; state: string }
  | { kind: "wait"; window: ScheduledWindow; wakeSec: number; state: string }
  | { kind: "paused"; window: ScheduledWindow; wakeSec: number; state: string }
  | { kind: "closed"; wakeSec: number | null; state: string };

export const DEFAULT_LEAD_SEC = 120;
export const DEFAULT_PRELIST = true;
export const DEFAULT_PRELIST_CADENCES_SEC = [300, 900, 3_600];
/** Kept in reserve from the Series' `maxLeadSec`, so a prelist never races the engine's own horizon check. */
export const PRELIST_MARGIN_SEC = 3_600;
export const DEFAULT_GAP_LEAD_SEC = 172_800;
export const DEFAULT_MIN_TRADABLE_SEC = 60;
/** Time the relay needs after a late open to fetch and record the opening prints before their deadline. */
export const PRINT_MARGIN_SEC = 45;

const hhmm = (sec: number) => new Date(sec * 1000).toISOString().slice(11, 16);
export const spanOf = (w: { tradingStartSec: number; expirySec: number }) => `${hhmm(w.tradingStartSec)}–${hhmm(w.expirySec)}Z`;

/** Pauses shared by every lane: a halt on the lane's asset, then a corporate action. Null = not paused. */
export function pauseOf(series: PlanSeries, clock: PlanClock, w: ScheduledWindow): string | null {
  const halt = haltOf(clock.halts, haltAssetOf(series.symbol, series.lane));
  if (halt) return haltPausedState(halt);
  const action = corporateActionFor({ symbol: series.symbol, lane: series.lane, window: w }, clock.skips, clock.multipliers);
  return action ? corporatePausedState(action.why) : null;
}

/** The open decision (or a pause) for a candidate inside its lead. */
export function decide(series: PlanSeries, clock: PlanClock, w: ScheduledWindow, label: string): SeriesPlan {
  const passSec = w.lockAtSec - clock.minTradableSec + 1;
  const paused = pauseOf(series, clock, w);
  if (paused) return { kind: "paused", window: w, wakeSec: passSec, state: paused };
  const version = highestCoveringVersion(series.versions, w.tradingStartSec, w.expirySec);
  if (version === null) return { kind: "paused", window: w, wakeSec: passSec, state: PAUSED_NO_SOURCE };
  return {
    kind: "open", window: w, index: series.nextIndex, policyVersion: version, openKind: BOUNDARY_KIND_U8[w.openKind], closeKind: BOUNDARY_KIND_U8[w.closeKind],
    state: `${label} #${series.nextIndex} ${describeVersion(version, series.versions[version]!)}`,
  };
}

export function liveSessionCloseSec(clock: PlanClock): number | null {
  return clock.calendar?.sessions.find((s) => s.openSec <= clock.nowSec && clock.nowSec < s.closeSec)?.closeSec ?? null;
}

function firstWindowOfNextSession(series: PlanSeries, clock: PlanClock): ScheduledWindow | null {
  const next = clock.calendar?.sessions.find((s) => s.openSec > clock.nowSec);
  return next ? (regularWindows(next, series.cadenceSec)[0] ?? null) : null;
}

/** Whether `w` may list before its lead: the next session's first Window, once nothing trades and the horizon allows. */
export function prelistable(series: PlanSeries, clock: PlanClock, w: ScheduledWindow): boolean {
  if (!clock.prelist || !clock.prelistCadencesSec.includes(series.cadenceSec)) return false;
  if (liveSessionCloseSec(clock) !== null) return false;
  if (firstWindowOfNextSession(series, clock)?.tradingStartSec !== w.tradingStartSec) return false;
  return w.tradingStartSec - clock.nowSec <= series.maxLeadSec - PRELIST_MARGIN_SEC;
}

function prelistWait(series: PlanSeries, clock: PlanClock, w: ScheduledWindow): SeriesPlan | null {
  if (!clock.prelist || !clock.prelistCadencesSec.includes(series.cadenceSec)) return null;
  if (firstWindowOfNextSession(series, clock)?.tradingStartSec !== w.tradingStartSec) return null;
  const horizonSec = w.tradingStartSec - series.maxLeadSec + PRELIST_MARGIN_SEC;
  const live = liveSessionCloseSec(clock);
  const wakeSec = Math.min(w.tradingStartSec - clock.leadSec, live ?? Number.MAX_SAFE_INTEGER, horizonSec > clock.nowSec ? horizonSec : Number.MAX_SAFE_INTEGER);
  return { kind: "wait", window: w, wakeSec, state: `waiting: lists at the close for ${spanOf(w)}` };
}

/** The earliest Window of today's or the next session that can still be opened on this Series. */
export function nextCandidate(series: PlanSeries, clock: PlanClock): ScheduledWindow | null {
  if (!clock.calendar) return null;
  const sessions = clock.calendar.sessions.filter((s) => s.closeSec > clock.nowSec).slice(0, 2);
  return (
    sessions.flatMap((s) => regularWindows(s, series.cadenceSec)).find((w) => {
      if (w.tradingStartSec < series.lastExpirySec || w.lockAtSec - clock.nowSec < clock.minTradableSec) return false;
      const version = highestCoveringVersion(series.versions, w.tradingStartSec, w.expirySec);
      return version === null || openPrintsAdmissible(series.versions[version]!, w, clock.nowSec, PRINT_MARGIN_SEC);
    }) ?? null
  );
}

export function planSeries(series: PlanSeries, clock: PlanClock): SeriesPlan {
  if (!clock.calendar) return { kind: "closed", wakeSec: null, state: "closed: no calendar" };
  const w = nextCandidate(series, clock);
  if (!w) return { kind: "closed", wakeSec: null, state: "closed: no session" };
  const untilOpen = w.tradingStartSec - clock.nowSec;
  const prelist = untilOpen > clock.leadSec && prelistable(series, clock, w);
  if (untilOpen > clock.leadSec && !prelist) {
    const waiting = prelistWait(series, clock, w);
    if (waiting) return waiting;
    const state = untilOpen <= series.cadenceSec ? `waiting: next ${spanOf(w)}` : "closed: no session";
    return { kind: "wait", window: w, wakeSec: w.tradingStartSec - clock.leadSec, state };
  }
  return decide(series, clock, w, `${prelist ? "prelisting" : "opening"} ${spanOf(w)}`);
}
