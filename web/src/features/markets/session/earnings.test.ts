import { describe, expect, it } from "vitest";
import { earningsNote } from "./earnings";

const SAT = 1_791_649_306; // Sat 2026-10-10 11:41 ET
const TSLA = [{ symbol: "TSLA" as const, dateEt: "2026-10-20", hour: "amc" as const }];
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe("the earnings note", () => {
  it("names the next report ahead, plainly", () => {
    expect(earningsNote("TSLA", null, TSLA, SAT)).toEqual({ tone: "info", text: "TSLA reports Tue 10-20, after the close" });
    expect(earningsNote("NVDA", null, TSLA, SAT)).toBeNull();
    expect(earningsNote("BTC", null, TSLA, SAT)).toBeNull();
    expect(earningsNote("TSLA", null, null, SAT)).toBeNull();
  });
  it("warns on a Regular Window on the report date", () => {
    const window = { lane: "regular" as const, tradingStartSec: at("2026-10-20T19:00:00Z"), expirySec: at("2026-10-20T19:05:00Z") };
    expect(earningsNote("TSLA", window, TSLA, window.tradingStartSec)).toEqual({ tone: "warning", text: "TSLA reports after the close today — prices can gap" });
  });
  it("warns on a Gap over an after-close Friday, and not on a 24/7 Window", () => {
    const events = [{ symbol: "AAPL" as const, dateEt: "2026-10-23", hour: "amc" as const }];
    const gap = { lane: "gap" as const, tradingStartSec: at("2026-10-23T20:00:00Z"), expirySec: at("2026-10-26T13:30:00Z") };
    expect(earningsNote("AAPL", gap, events, at("2026-10-22T12:00:00Z"))).toEqual({ tone: "warning", text: "AAPL reports after the close Fri — the Monday open can gap" });
    const token = { lane: "stock24" as const, tradingStartSec: at("2026-10-23T20:00:00Z"), expirySec: at("2026-10-23T20:05:00Z") };
    expect(earningsNote("AAPL", token, events, at("2026-10-23T12:00:00Z"))!.tone).toBe("info");
  });
});
