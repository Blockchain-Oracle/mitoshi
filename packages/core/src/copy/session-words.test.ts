// Ported from Agari 03b30ab:packages/core/src/copy/session-words.test.ts
import { describe, expect, it } from "vitest";
import { calendarFromAlpaca } from "../market/calendar-alpaca";
import { datesBetween, weekdayOfDate } from "../market/et-time";
import { sessionStatus } from "../market/session";
import { formatSessionSpan, sessionCountdown, sessionCountdownLine, sessionPhrase, sessionStateWord } from "./session-words";

const HOLIDAYS = new Set(["2026-11-26"]);
const EARLY = new Set(["2026-11-27"]);
const calendar = (from: string, to: string) =>
  calendarFromAlpaca(
    datesBetween(from, to)
      .filter((date) => weekdayOfDate(date) < 5 && !HOLIDAYS.has(date))
      .map((date) => ({ date, open: "09:30", close: EARLY.has(date) ? "13:00" : "16:00" })),
    from,
    to,
  );
const SEPTEMBER = calendar("2026-09-14", "2026-09-30");
const THANKSGIVING = calendar("2026-11-23", "2026-12-04");

/** The same clocks the /dev/session fixtures read at (UTC seconds). */
const CLOCK = {
  overnightTue: 1_789_444_800, // Tue 09-15 00:00 ET → closed, opens today
  preTue: 1_789_473_600, // Tue 09-15 08:00 ET
  regularTue: 1_789_491_600, // Tue 09-15 13:00 ET
  postTue: 1_789_506_000, // Tue 09-15 17:00 ET
  weekendSat: 1_789_830_060, // Sat 09-19 11:01 ET
  holidayThu: 1_795_708_800, // Thanksgiving 11-26 11:00 ET
  earlyCloseFri: 1_795_795_200, // Fri 11-27 11:00 ET, closes 13:00
} as const;

const at = (nowSec: number, cal = SEPTEMBER) => sessionStatus(nowSec, cal)!;

describe("sessionStateWord", () => {
  it("names every state, telling a weekend from a weekday overnight", () => {
    expect(sessionStateWord(at(CLOCK.preTue))).toBe("Pre-market");
    expect(sessionStateWord(at(CLOCK.regularTue))).toBe("Open");
    expect(sessionStateWord(at(CLOCK.postTue))).toBe("After hours");
    expect(sessionStateWord(at(CLOCK.overnightTue))).toBe("Closed");
    expect(sessionStateWord(at(CLOCK.weekendSat))).toBe("Weekend");
    expect(sessionStateWord(at(CLOCK.holidayThu, THANKSGIVING))).toBe("Holiday");
    expect(sessionStateWord(at(CLOCK.earlyCloseFri, THANKSGIVING))).toBe("Early close");
    expect(sessionStateWord(sessionStatus(CLOCK.regularTue, SEPTEMBER, { halted: true })!)).toBe("Halted");
  });
});

describe("sessionPhrase", () => {
  it("counts down to today's open in pre-market and overnight", () => {
    expect(sessionPhrase(at(CLOCK.preTue), CLOCK.preTue)).toBe("Pre-market · opens in 1h 30m");
    expect(sessionPhrase(at(CLOCK.preTue), CLOCK.preTue, () => "14:30 (09:30 ET)")).toBe("Pre-market · opens 14:30 (09:30 ET), in 1h 30m");
    expect(sessionPhrase(at(CLOCK.postTue), CLOCK.postTue, () => "Wed 14:30 (09:30 ET)")).toBe("After hours · reopens Wed 14:30 (09:30 ET)");
    expect(sessionPhrase(at(CLOCK.overnightTue), CLOCK.overnightTue)).toBe("Closed · opens in 9h 30m");
  });
  it("counts down to the close while open, and names the early close", () => {
    expect(sessionPhrase(at(CLOCK.regularTue), CLOCK.regularTue)).toBe("Open · closes in 3h 00m");
    expect(sessionPhrase(at(CLOCK.earlyCloseFri, THANKSGIVING), CLOCK.earlyCloseFri)).toBe("Early close · closes in 2h 00m");
  });
  it("names the day after hours, at the weekend and on a holiday", () => {
    expect(sessionPhrase(at(CLOCK.postTue), CLOCK.postTue)).toBe("After hours · reopens Wed 09:30 ET");
    expect(sessionPhrase(at(CLOCK.weekendSat), CLOCK.weekendSat)).toBe("Weekend · reopens Mon 09:30 ET");
    expect(sessionPhrase(at(CLOCK.holidayThu, THANKSGIVING), CLOCK.holidayThu)).toBe("Holiday · reopens Fri 09:30 ET");
  });
  it("says only the word for a halt, and 'Closed' when the calendar ends before the next open", () => {
    expect(sessionPhrase(sessionStatus(CLOCK.regularTue, SEPTEMBER, { halted: true })!, CLOCK.regularTue)).toBe("Halted");
    const lastDay = calendar("2026-09-14", "2026-09-15");
    expect(sessionPhrase(at(CLOCK.postTue, lastDay), CLOCK.postTue)).toBe("After hours");
  });
});

describe("formatSessionSpan", () => {
  it("counts to the minute, never the second", () => {
    expect(formatSessionSpan(3 * 86_400 + 2 * 3600 + 59)).toBe("3d 2h");
    expect(formatSessionSpan(3600 + 12 * 60 + 30)).toBe("1h 12m");
    expect(formatSessionSpan(59 * 60 + 58)).toBe("59m");
    expect(formatSessionSpan(42)).toBe("<1m");
    expect(formatSessionSpan(-5)).toBe("<1m");
    expect(sessionPhrase(at(CLOCK.preTue), CLOCK.preTue + 31 * 60 + 2)).toBe("Pre-market · opens in 58m");
  });
});

describe("sessionCountdown", () => {
  it("runs to the close while open and to the next open otherwise", () => {
    expect(sessionCountdown(at(CLOCK.regularTue), CLOCK.regularTue)).toEqual({ kind: "closes", atSec: 1_789_502_400, remainingSec: 3 * 3600 });
    expect(sessionCountdown(at(CLOCK.postTue), CLOCK.postTue)).toMatchObject({ kind: "opens", atSec: 1_789_565_400 });
    expect(sessionCountdownLine({ kind: "opens", atSec: 0, remainingSec: 16 * 3600 + 12 * 60 })).toBe("Opens in 16h 12m");
    expect(sessionCountdownLine({ kind: "closes", atSec: 0, remainingSec: 2 * 3600 + 5 * 60 })).toBe("Closes in 2h 05m");
  });
});
