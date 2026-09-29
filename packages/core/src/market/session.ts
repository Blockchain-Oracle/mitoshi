// Ported from Agari 03b30ab:packages/core/src/market/session.ts
import { POST_MARKET_SEC, PRE_MARKET_OPEN_MINUTES, sessionOnDate, type SessionCalendar, type TradingSession } from "./calendar";
import { addDays, ET_WEEKDAY_SHORT, etDateOf, etWallToUtcSec, formatEtClock, SEC_PER_DAY, weekdayOfDate } from "./et-time";

/**
 * The market-hours state every always-on surface renders.
 *
 * - `pre` 04:00 ET → open, `post` close → close + 4 h (20:00, or 17:00 on an early close), `closed` otherwise
 *   (overnight, weekends).
 * - `holiday`: a weekday with no session.
 * - `early-close`: regular hours on a day that closes before 16:00, so the surface can say "Closes 13:00 ET
 *   today". The day itself is flagged by `earlyClose`, which stays true in `pre` and `post` too.
 * - `halted`: regular hours while the caller reports a halt. The calendar can't know about halts, so this is
 *   an input; outside regular hours a halt leaves the state alone and only sets `halted`.
 */
export type SessionState = "pre" | "regular" | "early-close" | "halted" | "post" | "closed" | "holiday";

export interface SessionStatus {
  state: SessionState;
  /** The ET date of the instant. */
  date: string;
  /** The session on that date, or null when the market doesn't open that day. */
  session: TradingSession | null;
  earlyClose: boolean;
  halted: boolean;
  /** The next regular open at or after now; null when it lies beyond (or behind an unknown date in) the calendar. */
  nextOpenSec: number | null;
  /** Today's close while it's still ahead; null otherwise. */
  closesAtSec: number | null;
}

function nextOpenSec(calendar: SessionCalendar, date: string, today: TradingSession | null, nowSec: number): number | null {
  if (today && nowSec < today.openSec) return today.openSec;
  for (let d = addDays(date, 1); d <= calendar.toDate; d = addDays(d, 1)) {
    const session = sessionOnDate(calendar, d);
    if (session === undefined) return null;
    if (session) return session.openSec;
  }
  return null;
}

function stateOf(today: TradingSession | null, date: string, nowSec: number, halted: boolean): SessionState {
  if (today === null) return weekdayOfDate(date) >= 5 ? "closed" : "holiday";
  if (nowSec < etWallToUtcSec(date, PRE_MARKET_OPEN_MINUTES)) return "closed";
  if (nowSec < today.openSec) return "pre";
  if (nowSec < today.closeSec) {
    if (halted) return "halted";
    return today.earlyClose ? "early-close" : "regular";
  }
  return nowSec < today.closeSec + POST_MARKET_SEC ? "post" : "closed";
}

/** Session status at `nowSec`, or null when the calendar doesn't cover (or disputes) today. */
export function sessionStatus(nowSec: number, calendar: SessionCalendar, options: { halted?: boolean } = {}): SessionStatus | null {
  const date = etDateOf(nowSec);
  const today = sessionOnDate(calendar, date);
  if (today === undefined) return null;
  const halted = options.halted ?? false;
  return {
    state: stateOf(today, date, nowSec, halted),
    date,
    session: today,
    earlyClose: today?.earlyClose ?? false,
    halted,
    nextOpenSec: nextOpenSec(calendar, date, today, nowSec),
    closesAtSec: today && nowSec < today.closeSec ? today.closeSec : null,
  };
}

function daysApart(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(toDate) - Date.parse(fromDate)) / (SEC_PER_DAY * 1000));
}

/**
 * The honest one-line label: "Closes 16:00 ET", "Closes 13:00 ET today", "Trading halted",
 * "Opens Wed 09:30 ET", "Opens Tue 12-01 09:30 ET" (a week or more away), or "Closed" when the next open isn't
 * known. An open always names its weekday (S23): "Opens 09:30 ET" read at 22:00 ET, or by a reader past midnight
 * in another zone, was taken for today.
 */
export function sessionLabel(status: SessionStatus): string {
  const { state, closesAtSec } = status;
  if (state === "halted") return "Trading halted";
  if ((state === "regular" || state === "early-close") && closesAtSec !== null) {
    return `Closes ${formatEtClock(closesAtSec)} ET${state === "early-close" ? " today" : ""}`;
  }
  if (status.nextOpenSec === null) return "Closed";
  const openDate = etDateOf(status.nextOpenSec);
  const clock = formatEtClock(status.nextOpenSec);
  const weekday = ET_WEEKDAY_SHORT[weekdayOfDate(openDate)];
  return daysApart(status.date, openDate) < 7 ? `Opens ${weekday} ${clock} ET` : `Opens ${weekday} ${openDate.slice(5)} ${clock} ET`;
}
