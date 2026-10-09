// Ported from Agari 03b30ab:packages/core/src/market/calendar.ts (split S23 gate, F-S23-08): Alpaca's calendar rows and
// their zod schema, parsed by ops (`services/ops/src/calendar/alpaca.ts`). Kept apart so the terminal, which reads
// sessions through `calendar.ts`, never ships zod.
import { z } from "zod";
import { sessionAt, type SessionCalendar, type TradingSession } from "./calendar";
import { parseClockMinutes } from "./et-time";

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

