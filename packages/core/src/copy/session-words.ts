// Ported from Agari 03b30ab:packages/core/src/copy/session-words.ts
import { ET_WEEKDAY_SHORT, etDateOf, formatEtClock, SEC_PER_DAY, SEC_PER_HOUR, SEC_PER_MIN, weekdayOfDate } from "../market/et-time";
import type { SessionStatus } from "../market/session";

/**
 * The session as a word and a phrase (S6, G-12): every always-on surface says the same thing about the hour. Pure over
 * `SessionStatus`, so the Window chip, the closed banner and the CTA can never disagree; the enum is unchanged.
 */
export type SessionWord = "Pre-market" | "Open" | "Early close" | "Halted" | "After hours" | "Closed" | "Weekend" | "Holiday";

/** "Pre-market", "Open", "After hours", "Weekend" (a closed Saturday or Sunday), "Holiday", or "Closed" (a weekday overnight). */
export function sessionStateWord(status: Pick<SessionStatus, "state" | "date">): SessionWord {
  switch (status.state) {
    case "pre":
      return "Pre-market";
    case "regular":
      return "Open";
    case "early-close":
      return "Early close";
    case "halted":
      return "Halted";
    case "post":
      return "After hours";
    case "holiday":
      return "Holiday";
    case "closed":
      return weekdayOfDate(status.date) >= 5 ? "Weekend" : "Closed";
  }
}

/**
 * A span to the minute: "3d 2h", "1h 12m", "59m", "<1m". A session boundary is hours away as a rule, so seconds would
 * only make every chip on the page disagree with the next; every surface counts the same beat.
 */
export function formatSessionSpan(remainingSec: number): string {
  const total = Math.max(0, Math.floor(remainingSec));
  if (total >= SEC_PER_DAY) return `${Math.floor(total / SEC_PER_DAY)}d ${Math.floor((total % SEC_PER_DAY) / SEC_PER_HOUR)}h`;
  if (total >= SEC_PER_HOUR) return `${Math.floor(total / SEC_PER_HOUR)}h ${String(Math.floor((total % SEC_PER_HOUR) / SEC_PER_MIN)).padStart(2, "0")}m`;
  if (total >= SEC_PER_MIN) return `${Math.floor(total / SEC_PER_MIN)}m`;
  return "<1m";
}

export interface SessionCountdown {
  /** What the clock runs to: the close while the market is open, else the next open. */
  kind: "opens" | "closes";
  atSec: number;
  remainingSec: number;
}

/** The boundary the surface counts down to, or null when the calendar doesn't know the next open. */
export function sessionCountdown(status: Pick<SessionStatus, "state" | "closesAtSec" | "nextOpenSec">, nowSec: number): SessionCountdown | null {
  const open = status.state === "regular" || status.state === "early-close" || status.state === "halted";
  if (open && status.closesAtSec !== null) return { kind: "closes", atSec: status.closesAtSec, remainingSec: Math.max(0, status.closesAtSec - nowSec) };
  if (status.nextOpenSec === null) return null;
  return { kind: "opens", atSec: status.nextOpenSec, remainingSec: Math.max(0, status.nextOpenSec - nowSec) };
}

/** "Opens in 16h 12m" / "Closes in 2h 05m". */
export function sessionCountdownLine(countdown: SessionCountdown): string {
  return `${countdown.kind === "opens" ? "Opens" : "Closes"} in ${formatSessionSpan(countdown.remainingSec)}`;
}

/** "Tue 09:30 ET", or "Tue 12-01 09:30 ET" a week or more away — the same rule as core `sessionLabel`. */
function reopensAt(status: Pick<SessionStatus, "date">, openSec: number): string {
  const openDate = etDateOf(openSec);
  const weekday = ET_WEEKDAY_SHORT[weekdayOfDate(openDate)];
  const days = Math.round((Date.parse(openDate) - Date.parse(status.date)) / 86_400_000);
  return `${weekday}${days >= 7 ? ` ${openDate.slice(5)}` : ""} ${formatEtClock(openSec)} ET`;
}

/**
 * "Pre-market · opens in 1h 12m", "Open · closes in 2h 05m", "After hours · reopens Tue 09:30 ET",
 * "Weekend · reopens Mon 09:30 ET", "Holiday · reopens Fri 09:30 ET". A countdown only while the open is today;
 * a halt says its word alone (the halt's reason is the chip's); an unknown next open says the word alone.
 * `at` renders the boundary in the reader's zone ("Pre-market · opens 14:30 (09:30 ET), in 4h 19m"): a countdown
 * alone read as "the market is shut" to a UTC+1 reader watching pre-market prices move at 10:00 local.
 */
export function sessionPhrase(
  status: Pick<SessionStatus, "state" | "date" | "closesAtSec" | "nextOpenSec">,
  nowSec: number,
  at?: (sec: number) => string,
): string {
  const word = sessionStateWord(status);
  if (status.state === "halted") return word;
  const countdown = sessionCountdown(status, nowSec);
  if (!countdown) return word;
  const span = formatSessionSpan(countdown.remainingSec);
  if (countdown.kind === "closes") return at ? `${word} · closes ${at(countdown.atSec)}, in ${span}` : `${word} · closes in ${span}`;
  if (etDateOf(countdown.atSec) === status.date) return at ? `${word} · opens ${at(countdown.atSec)}, in ${span}` : `${word} · opens in ${span}`;
  return `${word} · reopens ${at ? at(countdown.atSec) : reopensAt(status, countdown.atSec)}`;
}
