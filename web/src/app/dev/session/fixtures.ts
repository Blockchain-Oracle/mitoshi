// Ported from Agari 03b30ab:web/src/app/dev/session/market-session-fixtures.ts — canned NYSE sessions for the S6 state
// fixtures: the same `MarketSession` a live `/session` read builds (`toMarketSession`), over an Alpaca-shaped calendar and
// fixed clocks, so a cell, a banner or a blocker renders here exactly as it would on the terminal.
import { datesBetween, sessionAt, weekdayOfDate, type HaltBoard, type SessionCalendar } from "@cwf/core";
import { toMarketSession, type MarketSession, type SessionBody } from "@/features/markets/session";

const HOLIDAYS = new Set(["2026-11-26"]);
const EARLY_CLOSES = new Set(["2026-11-27"]);

/** Weekdays 09:30–16:00 ET (13:00 on an early close), holidays left out — built with `sessionAt`, so no zod here. */
function calendar(from: string, to: string): SessionCalendar {
  const sessions = datesBetween(from, to)
    .filter((date) => weekdayOfDate(date) < 5 && !HOLIDAYS.has(date))
    .map((date) => sessionAt(date, 9 * 60 + 30, EARLY_CLOSES.has(date) ? 13 * 60 : 16 * 60));
  return { fromDate: from, toDate: to, sessions, unknownDates: [] };
}

const SEPTEMBER = calendar("2026-09-08", "2026-09-30");
const THANKSGIVING = calendar("2026-11-23", "2026-12-04");

/** The clocks each state is read at (UTC seconds). */
export const CLOCK = {
  overnightTue: 1_789_444_800, // Tue 09-15 00:00 ET
  preTue: 1_789_473_600, // Tue 09-15 08:00 ET
  regularTue: 1_789_491_600, // Tue 09-15 13:00 ET
  postTue: 1_789_506_000, // Tue 09-15 17:00 ET
  weekendSat: 1_789_830_060, // Sat 09-19 11:01 ET
  holidayThu: 1_795_708_800, // Thanksgiving 11-26 11:00 ET
  earlyCloseFri: 1_795_795_200, // Fri 11-27 11:00 ET — closes 13:00
} as const;

export const HALTS: HaltBoard = {
  TSLA: { reason: "exchange-halt", sinceSec: CLOCK.regularTue - 90 },
  AAPL: { reason: "redstone-stale", sinceSec: CLOCK.regularTue - 75 },
  NVDA: { reason: "redstone-signers", sinceSec: CLOCK.regularTue - 40 },
  "TSLA-24": { reason: "redstone-stale", sinceSec: CLOCK.weekendSat - 600 },
};

const bodyOf = (cal: SessionCalendar, nowSec: number, halts: HaltBoard = {}): SessionBody => ({
  nowSec,
  today: null,
  calendar: { fromDate: cal.fromDate, toDate: cal.toDate, unknownDates: cal.unknownDates, upcoming: cal.sessions, recent: [] },
  lanes: {},
  halts,
  earnings: null,
  skips: [],
});

/** A canned session at `nowSec`, carrying `asset`'s halt from `HALTS` when asked. */
export function fixtureSession(nowSec: number, asset?: keyof typeof HALTS, cal: SessionCalendar = SEPTEMBER): MarketSession {
  return toMarketSession(bodyOf(cal, nowSec, HALTS), nowSec, asset)!;
}

export const STATES: { name: string; symbol: string; nowSec: number; session: MarketSession }[] = [
  { name: "Overnight (a weekday, before 04:00 ET)", symbol: "TSLA", nowSec: CLOCK.overnightTue, session: fixtureSession(CLOCK.overnightTue) },
  { name: "Pre-market", symbol: "TSLA", nowSec: CLOCK.preTue, session: fixtureSession(CLOCK.preTue) },
  { name: "Open", symbol: "MSFT", nowSec: CLOCK.regularTue, session: fixtureSession(CLOCK.regularTue) },
  { name: "After hours", symbol: "TSLA", nowSec: CLOCK.postTue, session: fixtureSession(CLOCK.postTue) },
  { name: "Weekend", symbol: "TSLA", nowSec: CLOCK.weekendSat, session: fixtureSession(CLOCK.weekendSat) },
  { name: "Holiday", symbol: "TSLA", nowSec: CLOCK.holidayThu, session: fixtureSession(CLOCK.holidayThu, undefined, THANKSGIVING) },
  { name: "Early close", symbol: "TSLA", nowSec: CLOCK.earlyCloseFri, session: fixtureSession(CLOCK.earlyCloseFri, undefined, THANKSGIVING) },
  { name: "Halted — the exchange", symbol: "TSLA", nowSec: CLOCK.regularTue, session: fixtureSession(CLOCK.regularTue, "TSLA") },
  { name: "Halted — RedStone stale", symbol: "AAPL", nowSec: CLOCK.regularTue, session: fixtureSession(CLOCK.regularTue, "AAPL") },
  { name: "Halted — RedStone signers", symbol: "NVDA", nowSec: CLOCK.regularTue, session: fixtureSession(CLOCK.regularTue, "NVDA") },
  { name: "24/7 lane halted at the weekend", symbol: "TSLA", nowSec: CLOCK.weekendSat, session: fixtureSession(CLOCK.weekendSat, "TSLA-24") },
];
