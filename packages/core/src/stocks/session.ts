/**
 * The US-equity session the StockReference keeper flag carries (plan B.3.2 `setSession`; `SessionState` numbering),
 * derived from RedStone's **signed** `NY_MARKET_NEXT_CHANGE_TIME` datapoint (research 15 F16) instead of a hard-coded
 * holiday table (Agari R-01: no static calendar). The datapoint is the next NYSE open or close:
 * - next change at a close (16:00 ET, or 13:00 on an early close) → the market is open: REGULAR until it.
 * - next change at 09:30 ET: pre-market (EXTENDED, 04:00 → 09:30 ET) when that open is today; post-market (EXTENDED,
 *   close → close + 4 h) when the caller saw today's close; otherwise CLOSED (overnight, weekend, holiday).
 * Pure; the caller supplies the clock, the signed value and the last close it saw.
 */
import type { Session } from "./guard";

const HOUR = 3_600_000;

/** America/New_York wall-clock parts of `ms` (DST-aware, no library). */
export function nyClock(ms: number): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const OPEN_MIN = 9 * 60 + 30;
const PRE_MIN = 4 * 60;

export interface SessionCall {
  session: Session;
  /** When the flag stops being right (ms): the next change, the pre/post edge, or `now + maxTtlMs`, whichever first. */
  validUntilMs: number;
  /** Set when the next change is a close: the caller keeps it to recognise post-market after the close passes. */
  closeMs?: number;
}

export function sessionFromNextChange(nowMs: number, nextChangeMs: number, lastCloseMs: number | null, maxTtlMs = 15 * 60_000): SessionCall {
  const cap = (t: number) => Math.min(t, nowMs + maxTtlMs);
  const next = nyClock(nextChangeMs);
  const now = nyClock(nowMs);
  if (nextChangeMs <= nowMs) return { session: "UNKNOWN", validUntilMs: nowMs + 60_000 };
  if (next.minutes !== OPEN_MIN) return { session: "REGULAR", validUntilMs: cap(nextChangeMs), closeMs: nextChangeMs };
  if (lastCloseMs !== null && nowMs >= lastCloseMs && nowMs < lastCloseMs + 4 * HOUR) {
    return { session: "EXTENDED", validUntilMs: cap(lastCloseMs + 4 * HOUR) };
  }
  if (next.date === now.date && now.minutes >= PRE_MIN) return { session: "EXTENDED", validUntilMs: cap(nextChangeMs) };
  if (next.date === now.date) return { session: "CLOSED", validUntilMs: cap(nowMs + (PRE_MIN - now.minutes) * 60_000) };
  return { session: "CLOSED", validUntilMs: cap(nextChangeMs) };
}
