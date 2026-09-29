// Ported from Agari 03b30ab:packages/core/src/market/calendar.fixtures.ts
import { calendarFromAlpaca, type AlpacaCalendarDay, type SessionCalendar } from "./calendar";
import { datesBetween, weekdayOfDate } from "./et-time";

/** Three real rows from Alpaca `/v2/calendar?start=2026-11-25&end=2026-11-30`, fetched 2026-09-14. */
export const LIVE_ALPACA_ROWS = [
  { close: "16:00", date: "2026-11-25", open: "09:30", session_close: "2000", session_open: "0400", settlement_date: "2026-11-27" },
  { close: "13:00", date: "2026-11-27", open: "09:30", session_close: "1700", session_open: "0400", settlement_date: "2026-11-30" },
  { close: "16:00", date: "2026-11-30", open: "09:30", session_close: "2000", session_open: "0400", settlement_date: "2026-12-01" },
];

const HOLIDAYS = new Set(["2026-09-07", "2026-11-26", "2026-12-25", "2027-01-01", "2027-03-26"]);
const EARLY_CLOSES = new Set(["2026-11-27", "2026-12-24"]);

/** Alpaca-shaped rows for every NYSE session in the range (weekdays minus the holidays above). */
export function alpacaRows(from: string, to: string): AlpacaCalendarDay[] {
  return datesBetween(from, to)
    .filter((date) => weekdayOfDate(date) < 5 && !HOLIDAYS.has(date))
    .map((date) => ({ date, open: "09:30", close: EARLY_CLOSES.has(date) ? "13:00" : "16:00" }));
}

export function alpacaCalendar(from: string, to: string): SessionCalendar {
  return calendarFromAlpaca(alpacaRows(from, to), from, to);
}

export const utc = (iso: string): number => Date.parse(iso) / 1000;
