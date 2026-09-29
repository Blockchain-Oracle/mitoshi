// Ported from Agari 03b30ab:packages/core/src/market/calendar.ts
import { z } from "zod";
import { datesBetween, etWallToUtcSec, parseClockMinutes, SEC_PER_HOUR } from "./et-time";

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

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CLOCK_COLON = z.string().regex(/^\d{2}:\d{2}$/);
const CLOCK_COMPACT = z.string().regex(/^\d{4}$/);

/** One row of Alpaca `GET /v2/calendar` (verified live 2026-09-14: `{date, open, close, session_open, session_close, settlement_date}`). */
export const alpacaCalendarDaySchema = z.object({
  date: DATE,
  open: CLOCK_COLON,
  close: CLOCK_COLON,
  session_open: CLOCK_COMPACT.optional(),
  session_close: CLOCK_COMPACT.optional(),
  settlement_date: DATE.optional(),
});

export type AlpacaCalendarDay = z.infer<typeof alpacaCalendarDaySchema>;

export function sessionAt(date: string, openMinutes: number, closeMinutes: number): TradingSession {
  if (closeMinutes <= openMinutes) throw new Error(`session on ${date} closes before it opens`);
  return {
    date,
    openSec: etWallToUtcSec(date, openMinutes),
    closeSec: etWallToUtcSec(date, closeMinutes),
    earlyClose: closeMinutes < REGULAR_CLOSE_MINUTES,
  };
}

export function sessionFromAlpaca(day: AlpacaCalendarDay): TradingSession {
  return sessionAt(day.date, parseClockMinutes(day.open), parseClockMinutes(day.close));
}

/**
 * A calendar from Alpaca's response for `[fromDate, toDate]`. Alpaca lists only trading days, so a
 * missing date inside the requested range is a closed day. Throws on a malformed payload.
 */
export function calendarFromAlpaca(rows: unknown, fromDate: string, toDate: string): SessionCalendar {
  const days = z.array(alpacaCalendarDaySchema).parse(rows);
  const sessions = days
    .filter((day) => day.date >= fromDate && day.date <= toDate)
    .map(sessionFromAlpaca)
    .sort((a, b) => a.openSec - b.openSec);
  return { fromDate, toDate, sessions, unknownDates: [] };
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
