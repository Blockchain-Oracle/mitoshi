// Ported from Agari 03b30ab:packages/core/src/market/windows.test.ts
import { describe, expect, it } from "vitest";
import { alpacaCalendar, utc } from "./calendar.fixtures";
import { gapWindows, regularWindows, tokenWindows, type ScheduledWindow } from "./windows";

const iso = (sec: number) => new Date(sec * 1000).toISOString().replace(".000", "");
const span = (w: ScheduledWindow) => [iso(w.tradingStartSec), iso(w.lockAtSec), iso(w.expirySec), w.openKind, w.closeKind];

describe("regular windows", () => {
  const calendar = alpacaCalendar("2026-09-14", "2026-12-04");
  const session = (date: string) => calendar.sessions.find((s) => s.date === date)!;

  it("aligns 60m to the ET clock: 10:00 first, 16:00 last", () => {
    const hourly = regularWindows(session("2026-09-14"), 3_600);
    expect(hourly.map((w) => iso(w.tradingStartSec).slice(11, 16))).toEqual(["14:00", "15:00", "16:00", "17:00", "18:00", "19:00"]);
    expect(hourly.every((w) => w.tradingStartSec % 3_600 === 0 && w.lockAtSec === w.expirySec)).toBe(true);
    expect([hourly[0]!.openKind, hourly.at(-1)!.closeKind]).toEqual(["Intraday", "SessionClose"]);
    const fives = regularWindows(session("2026-09-14"), 300);
    expect([fives.length, fives[0]!.openKind, iso(fives[0]!.tradingStartSec)]).toEqual([78, "SessionOpen", "2026-09-14T13:30:00Z"]);
  });

  it("moves with DST: Monday 2026-11-02 opens at 14:30Z", () => {
    expect(span(regularWindows(session("2026-11-02"), 900)[0]!)).toEqual(["2026-11-02T14:30:00Z", "2026-11-02T14:45:00Z", "2026-11-02T14:45:00Z", "SessionOpen", "Intraday"]);
  });

  it("stops at 13:00 on the 2026-11-27 early close", () => {
    const early = session("2026-11-27");
    for (const cadence of [300, 900, 3_600]) {
      const windows = regularWindows(early, cadence);
      expect(windows.at(-1)!.expirySec).toBe(utc("2026-11-27T18:00:00Z"));
      expect(windows.at(-1)!.closeKind).toBe("SessionClose");
      expect(windows.every((w) => w.expirySec <= early.closeSec)).toBe(true);
    }
    expect(calendar.sessions.some((s) => s.date === "2026-11-26")).toBe(false);
  });
});

describe("gap windows", () => {
  it("opens Fri 09-25 16:00 ET, locks Sun 20:00 ET, expires Mon 09:30 ET", () => {
    const gaps = gapWindows(alpacaCalendar("2026-09-21", "2026-10-02"));
    expect(gaps.map(span)).toEqual([["2026-09-25T20:00:00Z", "2026-09-28T00:00:00Z", "2026-09-28T13:30:00Z", "SessionClose", "SessionOpen"]]);
  });

  it("spans a holiday Monday, a holiday Friday and the DST weekend", () => {
    const laborDay = gapWindows(alpacaCalendar("2026-08-31", "2026-09-11"));
    expect(laborDay.map(span)).toEqual([["2026-09-04T20:00:00Z", "2026-09-07T00:00:00Z", "2026-09-08T13:30:00Z", "SessionClose", "SessionOpen"]]);
    const goodFriday = gapWindows(alpacaCalendar("2027-03-22", "2027-04-02"));
    expect(goodFriday.map(span)).toEqual([["2027-03-25T20:00:00Z", "2027-03-29T00:00:00Z", "2027-03-29T13:30:00Z", "SessionClose", "SessionOpen"]]);
    const dst = gapWindows(alpacaCalendar("2026-10-26", "2026-11-06"));
    expect(dst.map(span)).toEqual([["2026-10-30T20:00:00Z", "2026-11-02T01:00:00Z", "2026-11-02T14:30:00Z", "SessionClose", "SessionOpen"]]);
  });

  it("lists nothing when the far side of the weekend is outside the calendar", () => {
    expect(gapWindows(alpacaCalendar("2026-09-21", "2026-09-27"))).toEqual([]);
  });
});

describe("token windows", () => {
  it("rolls aligned back-to-back Windows through the weekend", () => {
    const windows = tokenWindows(utc("2026-09-26T23:57:12Z"), utc("2026-09-27T00:30:00Z"), 900);
    expect(windows.map((w) => iso(w.tradingStartSec).slice(11, 16))).toEqual(["00:00", "00:15"]);
    expect(() => tokenWindows(0, 3_600, 420)).toThrow();
  });
});
