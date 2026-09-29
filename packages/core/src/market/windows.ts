// Ported from Agari 03b30ab:packages/core/src/market/windows.ts
import { sessionOnDate, type SessionCalendar, type TradingSession } from "./calendar";
import { addDays, datesBetween, etWallToUtcSec, SEC_PER_HOUR, weekdayOfDate } from "./et-time";

/** Which kind of boundary a print is taken at (plan §3.1 `Market.open_kind` / `close_kind`). */
export type BoundaryKind = "Intraday" | "SessionOpen" | "SessionClose";

/** One Window the roller would open: `tradingStart ≤ now < lockAt` trades, `expiry` is the close print's T. */
export interface ScheduledWindow {
  tradingStartSec: number;
  lockAtSec: number;
  expirySec: number;
  openKind: BoundaryKind;
  closeKind: BoundaryKind;
}

/** Regular and 24/7 token lanes run these cadences (plan §2.2). */
export const WINDOW_CADENCES_SEC = [300, 900, 3_600] as const;

/** The Gap Window stops trading at Sunday 20:00 ET. */
export const GAP_LOCK_MINUTES = 20 * 60;

/**
 * Cadences must divide one hour. ET's UTC offset is always a whole number of hours, so a boundary on the
 * ET clock (`:00`, `:15`, `:30`, …) is exactly a unix time with `ts % cadence == 0`, which is the alignment
 * `roller_open_window` can check on-chain without knowing the time zone.
 */
function assertCadence(cadenceSec: number): void {
  if (!Number.isInteger(cadenceSec) || cadenceSec < 60 || SEC_PER_HOUR % cadenceSec !== 0) {
    throw new Error(`cadence must be a whole number of seconds that divides one hour, got ${cadenceSec}`);
  }
}

function alignUp(sec: number, cadenceSec: number): number {
  return Math.ceil(sec / cadenceSec) * cadenceSec;
}

/**
 * Back-to-back Regular Windows for one session, aligned to the ET clock, all inside `[open, close]`.
 *
 * Alignment is to the clock, not to the open: 5m and 15m Windows start at 09:30, but the first 60m Window
 * is 10:00–11:00 and the last is 15:00–16:00 (12:00–13:00 on an early close). Aligning 60m to 09:30 would
 * end the last Window at 16:30, which plan §2.2 forbids ("No Window expires after 16:00").
 */
export function regularWindows(session: TradingSession, cadenceSec: number): ScheduledWindow[] {
  assertCadence(cadenceSec);
  const out: ScheduledWindow[] = [];
  for (let start = alignUp(session.openSec, cadenceSec); start + cadenceSec <= session.closeSec; start += cadenceSec) {
    const end = start + cadenceSec;
    out.push({
      tradingStartSec: start,
      lockAtSec: end,
      expirySec: end,
      openKind: start === session.openSec ? "SessionOpen" : "Intraday",
      closeKind: end === session.closeSec ? "SessionClose" : "Intraday",
    });
  }
  return out;
}

/** Regular Windows for every session the calendar knows. Disputed dates carry no session, so they list nothing. */
export function regularWindowsForCalendar(calendar: SessionCalendar, cadenceSec: number): ScheduledWindow[] {
  return calendar.sessions.flatMap((session) => regularWindows(session, cadenceSec));
}

function lastSessionBefore(calendar: SessionCalendar, saturday: string): TradingSession | undefined {
  for (let back = 1; back <= 5; back++) {
    const session = sessionOnDate(calendar, addDays(saturday, -back));
    if (session === undefined) return undefined;
    if (session) return session;
  }
  return undefined;
}

function firstSessionAfter(calendar: SessionCalendar, sunday: string): TradingSession | undefined {
  for (let ahead = 1; ahead <= 5; ahead++) {
    const session = sessionOnDate(calendar, addDays(sunday, ahead));
    if (session === undefined) return undefined;
    if (session) return session;
  }
  return undefined;
}

/**
 * One "Monday Gap" Window per weekend inside the calendar (plan §2.2):
 * - opens at the last session close before the weekend (Thursday's close when Friday is a holiday; 13:00
 *   when that day closes early);
 * - locks Sunday 20:00 ET, whatever follows;
 * - expires at the first session open after the weekend (Tuesday 09:30 when Monday is a holiday).
 *
 * A weekend is skipped when any date between the two sessions is unknown or outside the calendar, or when
 * no session falls in the week on either side. Policy coverage (one version for both prints) is the
 * roller's check, not this one.
 */
export function gapWindows(calendar: SessionCalendar): ScheduledWindow[] {
  const out: ScheduledWindow[] = [];
  for (const saturday of datesBetween(calendar.fromDate, calendar.toDate)) {
    if (weekdayOfDate(saturday) !== 5) continue;
    const sunday = addDays(saturday, 1);
    if (sessionOnDate(calendar, saturday) !== null || sessionOnDate(calendar, sunday) !== null) continue;
    const before = lastSessionBefore(calendar, saturday);
    const after = firstSessionAfter(calendar, sunday);
    if (!before || !after) continue;
    out.push({
      tradingStartSec: before.closeSec,
      lockAtSec: etWallToUtcSec(sunday, GAP_LOCK_MINUTES),
      expirySec: after.openSec,
      openKind: "SessionClose",
      closeKind: "SessionOpen",
    });
  }
  return out;
}

/** Back-to-back 24/7 token-lane Windows starting at or after `fromSec` and expiring no later than `toSec`. */
export function tokenWindows(fromSec: number, toSec: number, cadenceSec: number): ScheduledWindow[] {
  assertCadence(cadenceSec);
  const out: ScheduledWindow[] = [];
  for (let start = alignUp(fromSec, cadenceSec); start + cadenceSec <= toSec; start += cadenceSec) {
    const end = start + cadenceSec;
    out.push({ tradingStartSec: start, lockAtSec: end, expirySec: end, openKind: "Intraday", closeKind: "Intraday" });
  }
  return out;
}
