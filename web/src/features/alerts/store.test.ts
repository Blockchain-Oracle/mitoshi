import { beforeEach, describe, expect, it, vi } from "vitest";
import { addAlert, checkAlerts, loadAlerts, parseTargetCents } from "./store";

const mem = new Map<string, string>();
vi.stubGlobal("window", { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }, addEventListener() {}, removeEventListener() {} });

describe("price alerts", () => {
  beforeEach(() => mem.clear());

  it("reads typed prices as positive cents", () => {
    expect(parseTargetCents("251.37")).toBe(25_137);
    expect(parseTargetCents("1,020")).toBe(102_000);
    expect(parseTargetCents("0")).toBeNull();
    expect(parseTargetCents("abc")).toBeNull();
  });

  it("fires once at the crossing, on its own asset and basis only", () => {
    addAlert("TSLA", "regular", 25_000, "above");
    addAlert("TSLA", "allDay", 24_000, "below");
    const e8 = (usd: number) => BigInt(Math.round(usd * 100)) * 1_000_000n;
    expect(checkAlerts("TSLA", "regular", e8(249.99), 8)).toEqual([]);
    expect(checkAlerts("NVDA", "regular", e8(300), 8)).toEqual([]);
    expect(checkAlerts("TSLA", "allDay", e8(250), 8)).toEqual([]);
    expect(checkAlerts("TSLA", "regular", e8(250), 8).map((a) => a.direction)).toEqual(["above"]);
    expect(checkAlerts("TSLA", "regular", e8(260), 8)).toEqual([]);
    expect(checkAlerts("TSLA", "allDay", e8(239.5), 8).map((a) => a.direction)).toEqual(["below"]);
    expect(loadAlerts().every((a) => a.triggered)).toBe(true);
  });
});
