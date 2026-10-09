// Ported from Agari 03b30ab:packages/core/src/market/calendar.ts
import { datesBetween, etWallToUtcSec, SEC_PER_HOUR } from "./et-time";

/** A regular-hours close earlier than this (minutes after ET midnight) is an early close. */
export const REGULAR_CLOSE_MINUTES = 16 * 60;

/** Pre-market opens at 04:00 ET on every session day. */
export const PRE_MARKET_OPEN_MINUTES = 4 * 60;

/** Post-market runs four hours past the close: 16:00–20:00, or 13:00–17:00 on an early close (Alpaca `session_close`). */
export const POST_MARKET_SEC = 4 * SEC_PER_HOUR;

/** One NYSE regular session, in unix seconds. `date` is the ET calendar date. */
export interface TradingSession {
  date: string;
  openSec: number;
  closeSec: number;
  earlyClose: boolean;
}

/**
 * Sessions over an explicit date range. A date inside `[fromDate, toDate]` with no session is closed;
 * a date in `unknownDates` is not known either way (e.g. the two calendars disagreed), so nothing that
 * depends on it is listed. Dates outside the range are unknown.
 */
export interface SessionCalendar {
  fromDate: string;
  toDate: string;
  sessions: readonly TradingSession[];
  unknownDates: readonly string[];
}

export function sessionAt(date: string, openMinutes: number, closeMinutes: number): TradingSession {
  if (closeMinutes <= openMinutes) throw new Error(`session on ${date} closes before it opens`);
  return {
    date,
    openSec: etWallToUtcSec(date, openMinutes),
    closeSec: etWallToUtcSec(date, closeMinutes),
    earlyClose: closeMinutes < REGULAR_CLOSE_MINUTES,
  };
}

/** The session on an ET date: a session, `null` when closed, or `undefined` when the calendar doesn't know. */
export function sessionOnDate(calendar: SessionCalendar, date: string): TradingSession | null | undefined {
  if (date < calendar.fromDate || date > calendar.toDate || calendar.unknownDates.includes(date)) return undefined;
  return calendar.sessions.find((s) => s.date === date) ?? null;
}

/** True when every date in `[from, to]` is inside the calendar and none is unknown. */
export function calendarKnows(calendar: SessionCalendar, from: string, to: string): boolean {
  if (from < calendar.fromDate || to > calendar.toDate) return false;
  return datesBetween(from, to).every((date) => !calendar.unknownDates.includes(date));
}
