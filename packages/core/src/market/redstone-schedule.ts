// Replaces Agari 03b30ab:packages/core/src/market/pyth-schedule.ts: on Tempo the second calendar is RedStone's signed
// `NY_MARKET_NEXT_CHANGE_TIME` datapoint (context 15 §2.4; plan S1 1a "calendar = RedStone ∩ Alpaca"). The agreement
// rule is Agari's: a disputed date becomes unknown, so the roller lists nothing on it.
import { PRE_MARKET_OPEN_MINUTES, sessionOnDate, type SessionCalendar, type TradingSession } from "./calendar";
import { addDays, datesBetween, etDateOf, etWallToUtcSec, SEC_PER_HOUR } from "./et-time";

/**
 * RedStone publishes no `<T>---24_7` package (nor `---PRE_AFTER`) stamped exactly 04:00:00 ET, the overnight →
 * pre-market switch: 0 signers for all seven 24/7 names on 2026-09-28, 09-29 and 09-30, while 03:59:50 and 04:00:10
 * carry 5/5 and the plain, `---EXTENDED` and crypto feeds are complete at that instant (D-185). The engine admits only
 * packages stamped exactly T, so no print can ever be recorded there. Stated in ET wall time like every session rule:
 * 08:00Z under EDT, 09:00Z under EST.
 */
export const REDSTONE_24_7_GAP_MINUTES = PRE_MARKET_OPEN_MINUTES;

/** Whether `tSec` is RedStone's daily `---24_7` gap instant (04:00:00 ET that day). */
export function isRedStone24x7Gap(tSec: number): boolean {
  // ET is a whole number of hours from UTC, so 04:00:00 ET is always on the hour: skip the Intl read otherwise.
  if (tSec % SEC_PER_HOUR !== 0) return false;
  return etWallToUtcSec(etDateOf(tSec), REDSTONE_24_7_GAP_MINUTES) === tSec;
}

/**
 * One signed observation of RedStone's `NY_MARKET_NEXT_CHANGE_TIME`: at `observedSec`, the next NYSE regular-hours
 * open or close is at `nextChangeSec` (the feed's value is unix ms; the caller divides by 1,000).
 */
export interface NextChangeObservation {
  observedSec: number;
  nextChangeSec: number;
}

/**
 * The next regular open or close strictly after `nowSec` per the calendar; `undefined` when the calendar can't say
 * (an unknown date or the end of its range comes first).
 */
export function nextBoundaryAfter(calendar: SessionCalendar, nowSec: number): number | undefined {
  for (let date = etDateOf(nowSec); date <= calendar.toDate; date = addDays(date, 1)) {
    const session: TradingSession | null | undefined = sessionOnDate(calendar, date);
    if (session === undefined) return undefined;
    if (!session) continue;
    if (session.openSec > nowSec) return session.openSec;
    if (session.closeSec > nowSec) return session.closeSec;
  }
  return undefined;
}

export interface NextChangeDisagreement {
  observation: NextChangeObservation;
  /** What Alpaca's calendar implies; null when it can't say. */
  alpacaSec: number | null;
}

export interface RedStoneAgreement {
  /** Alpaca's calendar with every date a disagreement spans moved to `unknownDates`. */
  calendar: SessionCalendar;
  disagreements: NextChangeDisagreement[];
}

/**
 * Alpaca ∩ RedStone. Each observation must name exactly the boundary Alpaca implies; otherwise every ET date from the
 * observation to the later of the two boundaries becomes unknown (one of the sources is wrong about that stretch, and
 * we can't tell which).
 */
export function agreeWithRedStone(alpaca: SessionCalendar, observations: readonly NextChangeObservation[]): RedStoneAgreement {
  const disagreements: NextChangeDisagreement[] = [];
  const disputed = new Set<string>();
  for (const observation of observations) {
    const implied = nextBoundaryAfter(alpaca, observation.observedSec);
    if (implied === observation.nextChangeSec) continue;
    disagreements.push({ observation, alpacaSec: implied ?? null });
    const until = Math.max(observation.nextChangeSec, implied ?? observation.nextChangeSec);
    for (const date of datesBetween(etDateOf(observation.observedSec), etDateOf(until))) {
      if (date >= alpaca.fromDate && date <= alpaca.toDate) disputed.add(date);
    }
  }
  const calendar: SessionCalendar = {
    fromDate: alpaca.fromDate,
    toDate: alpaca.toDate,
    sessions: alpaca.sessions.filter((s) => !disputed.has(s.date)),
    unknownDates: [...new Set([...alpaca.unknownDates, ...disputed])].sort(),
  };
  return { calendar, disagreements };
}
