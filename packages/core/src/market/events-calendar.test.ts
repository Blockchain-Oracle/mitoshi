// Ported from Agari 03b30ab:packages/core/src/market/events-calendar.test.ts
import { describe, expect, it } from "vitest";
import type { EarningsEvent } from "../types/session-lanes";
import { alpacaCalendar, utc } from "./calendar.fixtures";
import { EARNINGS_SYMBOLS, earningsEventFor, earningsFlag, earningsRange } from "./events-calendar";
import { parseFinnhubEarnings } from "./events-calendar-finnhub";
import { gapWindows, regularWindows } from "./windows";

const calendar = alpacaCalendar("2026-09-14", "2027-04-02");
const gapFrom = (friday: string) => gapWindows(calendar).find((w) => w.tradingStartSec >= utc(`${friday}T00:00:00Z`))!;
const gap = (friday: string) => ({ lane: "gap" as const, ...gapFrom(friday) });
const regular = (date: string) => ({ lane: "regular" as const, ...regularWindows(calendar.sessions.find((s) => s.date === date)!, 300)[0]! });
const event = (dateEt: string, hour: EarningsEvent["hour"], symbol: EarningsEvent["symbol"] = "TSLA"): EarningsEvent => ({ symbol, dateEt, hour });

describe("earningsFlag", () => {
  it("flags a Regular Window on the report date, whatever the hour, and only for that ticker", () => {
    expect(earningsFlag("TSLA", regular("2026-10-21"), [event("2026-10-21", "amc")])).toBe("earnings-session");
    expect(earningsFlag("TSLA", regular("2026-10-22"), [event("2026-10-21", "amc")])).toBeNull();
    expect(earningsFlag("NVDA", regular("2026-10-21"), [event("2026-10-21", "amc")])).toBeNull();
  });

  it("flags a Gap on an after-close Friday or a before-open Monday only", () => {
    const g = gap("2026-10-23"); // Fri 10-23 16:00 ET → Mon 10-26 09:30 ET
    expect(earningsFlag("TSLA", g, [event("2026-10-23", "amc")])).toBe("earnings-gap");
    expect(earningsFlag("TSLA", g, [event("2026-10-26", "bmo")])).toBe("earnings-gap");
    for (const off of [event("2026-10-23", "bmo"), event("2026-10-26", "amc"), event("2026-10-26", "dmh"), event("2026-10-23", null), event("2026-10-24", "amc")]) {
      expect(earningsFlag("TSLA", g, [off])).toBeNull();
    }
  });

  it("uses the Gap's real boundaries across a holiday: Good Friday 2027-03-26 moves its Friday to Thursday", () => {
    const g = gap("2027-03-25");
    expect(new Date(g.tradingStartSec * 1000).toISOString()).toBe("2027-03-25T20:00:00.000Z");
    expect(earningsEventFor("MSFT", g, [event("2027-03-25", "amc", "MSFT")])).toEqual({ flag: "earnings-gap", event: event("2027-03-25", "amc", "MSFT") });
    expect(earningsFlag("MSFT", g, [event("2027-03-26", "amc", "MSFT")])).toBeNull();
  });

  it("never flags a token Window", () => {
    expect(earningsFlag("TSLA", { lane: "stock24", tradingStartSec: utc("2026-10-21T14:00:00Z"), expirySec: utc("2026-10-21T14:05:00Z") }, [event("2026-10-21", "bmo")])).toBeNull();
  });
});

describe("Finnhub earnings", () => {
  it("keeps the registry stocks, drops malformed rows, dedupes a date and sorts soonest first", () => {
    const body = {
      earningsCalendar: [
        { date: "2026-10-28", epsActual: null, epsEstimate: 3.1, hour: "amc", quarter: 3, revenueActual: null, revenueEstimate: 1.2e11, symbol: "MSFT", year: 2026 },
        { date: "2026-10-21", hour: "", symbol: "TSLA" },
        { date: "2026-10-21", hour: "amc", symbol: "TSLA" },
        { date: "2026-10-22", hour: "bmo", symbol: "IBM" },
        { date: "10/29/2026", hour: "amc", symbol: "AAPL" },
        { hour: "amc", symbol: "META" },
      ],
    };
    expect(parseFinnhubEarnings(body, EARNINGS_SYMBOLS)).toEqual([event("2026-10-21", "amc"), event("2026-10-28", "amc", "MSFT")]);
    expect(parseFinnhubEarnings({ earningsCalendar: [] }, EARNINGS_SYMBOLS)).toEqual([]);
    expect(parseFinnhubEarnings({ error: "API limit reached" }, EARNINGS_SYMBOLS)).toBeNull();
  });

  it("asks for the ten stocks (crypto never reports) over 14 ET days", () => {
    expect(EARNINGS_SYMBOLS).toEqual(["TSLA", "NVDA", "AAPL", "MSFT", "META", "GOOGL", "AMZN", "PLTR", "AMD", "SPCX"]);
    expect(earningsRange(utc("2026-09-15T02:00:00Z"))).toEqual({ from: "2026-09-14", to: "2026-09-28" });
  });
});
