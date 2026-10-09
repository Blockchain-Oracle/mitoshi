// Ported from Agari 03b30ab:packages/core/src/market/calendar.test.ts
import { describe, expect, it } from "vitest";
import { calendarFromAlpaca } from "./calendar-alpaca";
import { alpacaCalendar, LIVE_ALPACA_ROWS, utc } from "./calendar.fixtures";
import { etWallToUtcSec } from "./et-time";
import { agreeWithRedStone, nextBoundaryAfter } from "./redstone-schedule";
import { sessionLabel, sessionStatus } from "./session";
import { regularWindowsForCalendar } from "./windows";

describe("ET wall time", () => {
  it("converts across the 2026-11-01 DST switch", () => {
    expect(etWallToUtcSec("2026-10-30", 9 * 60 + 30)).toBe(utc("2026-10-30T13:30:00Z"));
    expect(etWallToUtcSec("2026-11-02", 9 * 60 + 30)).toBe(utc("2026-11-02T14:30:00Z"));
    // Four hours after the switch: a fixed "wall − 4 h" offset probe would land an hour early here.
    expect(etWallToUtcSec("2026-11-01", 5 * 60)).toBe(utc("2026-11-01T10:00:00Z"));
    // The ambiguous 01:30 resolves to the earlier (EDT) instant.
    expect(etWallToUtcSec("2026-11-01", 90)).toBe(utc("2026-11-01T05:30:00Z"));
  });
});

describe("Alpaca calendar", () => {
  it("reads the live row shape, including the 13:00 early close", () => {
    const calendar = calendarFromAlpaca(LIVE_ALPACA_ROWS, "2026-11-25", "2026-11-30");
    expect(calendar.sessions.map((s) => [s.date, s.earlyClose])).toEqual([
      ["2026-11-25", false],
      ["2026-11-27", true],
      ["2026-11-30", false],
    ]);
    expect(calendar.sessions[1]!.closeSec).toBe(utc("2026-11-27T18:00:00Z"));
  });
});

describe("RedStone NY_MARKET_NEXT_CHANGE_TIME ∩ Alpaca", () => {
  it("agrees on the live observation: Friday evening → Monday 13:30Z open (context 15 §2.4)", () => {
    const alpaca = alpacaCalendar("2026-09-14", "2026-09-30");
    const observation = { observedSec: utc("2026-09-18T22:00:00Z"), nextChangeSec: 1_789_997_400 };
    expect(nextBoundaryAfter(alpaca, observation.observedSec)).toBe(observation.nextChangeSec);
    expect(agreeWithRedStone(alpaca, [observation]).disagreements).toEqual([]);
  });

  it("names the close while a session is open, including the 13:00 early close", () => {
    const alpaca = alpacaCalendar("2026-11-23", "2026-11-30");
    expect(nextBoundaryAfter(alpaca, utc("2026-11-27T15:00:00Z"))).toBe(utc("2026-11-27T18:00:00Z"));
    expect(nextBoundaryAfter(alpaca, utc("2026-11-25T22:00:00Z"))).toBe(utc("2026-11-27T14:30:00Z"));
  });

  it("lists nothing on the dates a disagreement spans", () => {
    const alpaca = alpacaCalendar("2026-11-23", "2026-11-30");
    // RedStone says the 11-27 session closes at 16:00 while Alpaca says 13:00.
    const observation = { observedSec: utc("2026-11-27T15:00:00Z"), nextChangeSec: utc("2026-11-27T21:00:00Z") };
    const { calendar, disagreements } = agreeWithRedStone(alpaca, [observation]);
    expect(disagreements).toHaveLength(1);
    expect(calendar.unknownDates).toEqual(["2026-11-27"]);
    const listedDates = regularWindowsForCalendar(calendar, 300).map((w) => new Date(w.tradingStartSec * 1000).toISOString().slice(0, 10));
    expect(listedDates).not.toContain("2026-11-27");
    expect(sessionStatus(utc("2026-11-27T16:00:00Z"), calendar)).toBeNull();
  });
});

describe("session status", () => {
  const calendar = alpacaCalendar("2026-11-23", "2026-12-04");

  it("calls Thanksgiving a holiday and points at Friday's open", () => {
    const status = sessionStatus(utc("2026-11-26T17:00:00Z"), calendar)!;
    expect(status.state).toBe("holiday");
    expect(status.nextOpenSec).toBe(utc("2026-11-27T14:30:00Z"));
    expect(sessionLabel(status)).toBe("Opens Fri 09:30 ET");
  });

  it("names the weekday even when the open is later the same ET day (S23)", () => {
    // 03:00 ET on Friday the 27th, before the 09:30 bell: "Opens 09:30 ET" was read as the wrong day.
    expect(sessionLabel(sessionStatus(utc("2026-11-27T08:00:00Z"), calendar)!)).toBe("Opens Fri 09:30 ET");
  });

  it("walks the early-close day from pre to closed", () => {
    const at = (iso: string) => sessionStatus(utc(iso), calendar)!;
    expect([at("2026-11-27T08:59:00Z").state, at("2026-11-27T09:00:00Z").state]).toEqual(["closed", "pre"]);
    const midday = at("2026-11-27T17:00:00Z");
    expect([midday.state, midday.earlyClose, sessionLabel(midday)]).toEqual(["early-close", true, "Closes 13:00 ET today"]);
    expect(at("2026-11-27T21:59:00Z").state).toBe("post");
    const evening = at("2026-11-27T22:00:00Z");
    expect([evening.state, sessionLabel(evening)]).toEqual(["closed", "Opens Mon 09:30 ET"]);
  });

  it("reports a halt only during regular hours", () => {
    expect(sessionStatus(utc("2026-11-30T15:00:00Z"), calendar, { halted: true })!.state).toBe("halted");
    const pre = sessionStatus(utc("2026-11-30T12:00:00Z"), calendar, { halted: true })!;
    expect([pre.state, pre.halted]).toEqual(["pre", true]);
  });
});
