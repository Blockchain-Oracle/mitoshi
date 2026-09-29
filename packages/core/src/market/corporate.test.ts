// Ported from Agari 03b30ab:packages/core/src/market/corporate.test.ts
import { describe, expect, it } from "vitest";
import type { CorporateSkip, MultiplierChange } from "../types/session-lanes";
import { alpacaCalendar, utc } from "./calendar.fixtures";
import { corporateActionFor, corporatePausedState, multiplierApplies, skipApplies } from "./corporate";
import { gapWindows, regularWindows } from "./windows";

const calendar = alpacaCalendar("2026-09-14", "2027-04-02");
const gap = (friday: string) => gapWindows(calendar).find((w) => w.tradingStartSec >= utc(`${friday}T00:00:00Z`))!;
const skip = (date: string, lanes?: CorporateSkip["lanes"]): CorporateSkip => ({ symbol: "TSLA", date, why: "3-for-1 split", ...(lanes ? { lanes } : {}) });

describe("skipApplies", () => {
  it("matches a Regular Window on its start date only", () => {
    const first = regularWindows(calendar.sessions.find((s) => s.date === "2026-09-25")!, 3_600)[0]!;
    expect(skipApplies(skip("2026-09-25"), first, "regular")).toBe(true);
    expect(skipApplies(skip("2026-09-28"), first, "regular")).toBe(false);
    expect(skipApplies(skip("2026-09-25", ["gap", "stock24"]), first, "regular")).toBe(false);
  });

  it("matches a Gap on its Friday or its Monday, never the weekend between", () => {
    const g = gap("2026-09-18"); // [Fri 09-18 20:00Z, Mon 09-21 13:30Z]
    expect([g.tradingStartSec, g.lockAtSec, g.expirySec]).toEqual([1_789_761_600, 1_789_948_800, 1_789_997_400]);
    expect(skipApplies(skip("2026-09-18"), g, "gap")).toBe(true);
    expect(skipApplies(skip("2026-09-21"), g, "gap")).toBe(true);
    expect(skipApplies(skip("2026-09-19"), g, "gap")).toBe(false);
    expect(skipApplies(skip("2026-09-21", ["regular"]), g, "gap")).toBe(false);
    expect(skipApplies(skip("2026-09-21", ["gap"]), g, "gap")).toBe(true);
  });

  it("follows the Gap's real boundaries: Thanksgiving's early-close Friday and Good Friday's Thursday", () => {
    const thanksgiving = gap("2026-11-27"); // Fri 11-27 13:00 ET → Mon 11-30 09:30 ET
    expect(new Date(thanksgiving.tradingStartSec * 1000).toISOString()).toBe("2026-11-27T18:00:00.000Z");
    expect(skipApplies(skip("2026-11-27"), thanksgiving, "gap")).toBe(true);
    const goodFriday = gap("2027-03-25"); // Thu 03-25 16:00 ET → Mon 03-29 09:30 ET
    expect(skipApplies(skip("2027-03-25"), goodFriday, "gap")).toBe(true);
    expect(skipApplies(skip("2027-03-26"), goodFriday, "gap")).toBe(false);
    expect(skipApplies(skip("2027-03-29"), goodFriday, "gap")).toBe(true);
  });
});

describe("multipliers on the 24/7 stock lane", () => {
  const w = { tradingStartSec: utc("2026-09-19T14:00:00Z"), expirySec: utc("2026-09-19T14:05:00Z") };
  const change = (effectiveSec: number, symbol: MultiplierChange["symbol"] = "TSLA"): MultiplierChange => ({ symbol, effectiveSec, from: "1", to: "3", why: "TSLA 3-for-1 multiplier" });

  it("skips a Window whose (tradingStart, expiry] contains the change", () => {
    expect(multiplierApplies(change(w.tradingStartSec), w)).toBe(false);
    expect(multiplierApplies(change(w.tradingStartSec + 1), w)).toBe(true);
    expect(multiplierApplies(change(w.expirySec), w)).toBe(true);
    expect(multiplierApplies(change(w.expirySec + 1), w)).toBe(false);
  });

  it("pauses only the 24/7 lane of that ticker", () => {
    const changes = [change(w.expirySec), change(w.expirySec, "NVDA")];
    expect(corporateActionFor({ symbol: "TSLA", lane: "stock24", window: w }, [], changes)).toEqual({ why: "TSLA 3-for-1 multiplier" });
    expect(corporateActionFor({ symbol: "AMD", lane: "stock24", window: w }, [], changes)).toBeNull();
    expect(corporateActionFor({ symbol: "TSLA", lane: "regular", window: w }, [], changes)).toBeNull();
    expect(corporateActionFor({ symbol: "NVDA", lane: "stock24", window: w }, [{ ...skip("2026-09-19"), symbol: "NVDA", why: "split" }], [])).toEqual({ why: "split" });
    expect(corporatePausedState("split")).toBe("paused: corporate action (split)");
  });
});
