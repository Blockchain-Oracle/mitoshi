// Ported from Agari 03b30ab:packages/core/src/market/et-time.ts
/**
 * New York wall time ↔ unix seconds, DST-correct, with no dependency beyond `Intl`.
 *
 * Every calendar rule (sessions, Window boundaries, the Gap lock) is stated in ET wall time, but
 * everything on-chain is unix seconds. This is the one conversion both sides share.
 */

export const ET_TIME_ZONE = "America/New_York";

/** Day of the week, Monday first: 0 = Monday … 6 = Sunday. */
export type EtWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const ET_WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const SEC_PER_MIN = 60;
export const SEC_PER_HOUR = 3_600;
export const SEC_PER_DAY = 86_400;
export const MIN_PER_DAY = 1_440;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallParts(sec: number): WallParts {
  const out: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(new Date(sec * 1000))) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return { year: out.year!, month: out.month!, day: out.day!, hour: out.hour!, minute: out.minute!, second: out.second! };
}

/** Minutes ET is offset from UTC at instant `sec` (−240 in EDT, −300 in EST). */
export function etOffsetMinutesAt(sec: number): number {
  const p = wallParts(sec);
  const wallAsUtcSec = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000;
  return Math.round((wallAsUtcSec - sec) / SEC_PER_MIN);
}

function parseDate(date: string): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`not a YYYY-MM-DD date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** "HH:MM" or "HHMM" → minutes after midnight (24:00 allowed as end of day). */
export function parseClockMinutes(hhmm: string): number {
  const m = /^(\d{2}):?(\d{2})$/.exec(hhmm);
  const hours = Number(m?.[1]);
  const minutes = Number(m?.[2]);
  if (!m || minutes > 59 || hours * 60 + minutes > MIN_PER_DAY) throw new Error(`not a clock time: ${hhmm}`);
  return hours * 60 + minutes;
}

/**
 * ET wall `date` at `minutes` after midnight → unix seconds.
 *
 * Two passes: the offset is read at the first guess, then again at the corrected instant, so a wall
 * time on either side of a DST switch lands right. (A fixed "wall − 4 h" probe is wrong for wall
 * times in the first hours after a switch.) An ambiguous fall-back time (01:00–02:00 on the switch
 * Sunday) resolves to the earlier, EDT instant; no session or lock time falls in either DST gap.
 */
export function etWallToUtcSec(date: string, minutes: number): number {
  const [y, mo, d] = parseDate(date);
  const wallAsUtcSec = Date.UTC(y, mo - 1, d) / 1000 + minutes * SEC_PER_MIN;
  const firstGuess = wallAsUtcSec - etOffsetMinutesAt(wallAsUtcSec) * SEC_PER_MIN;
  return wallAsUtcSec - etOffsetMinutesAt(firstGuess) * SEC_PER_MIN;
}

/** The ET calendar date ("YYYY-MM-DD") that instant `sec` falls on. */
export function etDateOf(sec: number): string {
  const p = wallParts(sec);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Minutes after ET midnight at instant `sec`. */
export function etMinutesOf(sec: number): number {
  const p = wallParts(sec);
  return p.hour * 60 + p.minute;
}

/** Weekday of a calendar date (pure date arithmetic, no time zone involved). */
export function weekdayOfDate(date: string): EtWeekday {
  const [y, mo, d] = parseDate(date);
  // getUTCDay: 0 = Sunday; shift so Monday = 0.
  return ((new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7) as EtWeekday;
}

/** Calendar date `days` after `date` (negative moves back). */
export function addDays(date: string, days: number): string {
  const [y, mo, d] = parseDate(date);
  const shifted = new Date(Date.UTC(y, mo - 1, d + days));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/** Inclusive list of calendar dates from `from` to `to`. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) out.push(date);
  return out;
}

/** "09:30" for an instant, in ET. */
export function formatEtClock(sec: number): string {
  const minutes = etMinutesOf(sec);
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
