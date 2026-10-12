// Ported from Owarine 90a91d71:web/src/features/markets/chart/model.test.ts (O-3, D-222)
import { describe, expect, it } from "vitest";
import { assemble, chartSpan, decimate, displayDecimals, monotoneTangents, priceTicks, tagY, timeTicks, truncate, yRange } from "./model";

const MIN = 60_000;

describe("chartSpan", () => {
  const w2 = { openMs: 10 * MIN, closeMs: 12 * MIN };
  it("runs a live 2m Window from a one-minute lead to just past its close", () => {
    const s = chartSpan(w2, 11 * MIN, null, true);
    expect(s.fromMs).toBe(9 * MIN);
    expect(s.toMs).toBeCloseTo(12 * MIN + 0.03 * 2 * MIN);
  });
  it("leads a 60m Window by fifteen minutes, never more", () => {
    expect(chartSpan({ openMs: 100 * MIN, closeMs: 160 * MIN }, 120 * MIN, null, true).fromMs).toBe(85 * MIN);
  });
  it("rolls the last quarter hour for a Window that is still hours away", () => {
    const s = chartSpan({ openMs: 600 * MIN, closeMs: 615 * MIN }, 100 * MIN, null, true);
    expect(s.fromMs).toBe(85 * MIN);
  });
  it("spans a static series' own data", () => {
    const s = chartSpan(null, 999 * MIN, { t: [1_000, 3_000], p: [1, 2] }, false);
    expect(s.fromMs).toBe(1_000);
    expect(s.toMs).toBeCloseTo(3_060);
  });
});

describe("assemble", () => {
  it("draws the backfill only until the live series starts, with one run-in point before the span", () => {
    const back = { t: [0, 100, 200, 300], p: [1, 2, 3, 4] };
    const live = { t: [250, 260, 900], p: [9, 8, 7] };
    const out = assemble(back, live, 150, 800);
    expect(out.t).toEqual([100, 200, 250, 260]);
    expect(out.p).toEqual([2, 3, 9, 8]);
  });
});

describe("decimate", () => {
  it("keeps a column's first, low, high and last, so a spike survives", () => {
    const t = [0, 1, 2, 3, 4, 10];
    const p = [5, 9, 1, 6, 5, 4];
    const out = decimate(t, p, 0, 5);
    expect(out.t).toEqual([0, 1, 2, 4, 10]);
    expect(out.p).toEqual([5, 9, 1, 5, 4]);
  });
});

describe("yRange", () => {
  it("always contains the opening print, however far the price has run", () => {
    const r = yRange([100, 101], 90)!;
    expect(r.lo).toBeLessThan(90);
    expect(r.hi).toBeGreaterThan(101);
  });
  it("never shrinks below five basis points, so a flat line is not blown up into noise", () => {
    const r = yRange([83_250, 83_250], null)!;
    expect(r.hi - r.lo).toBeGreaterThanOrEqual(83_250 * 5e-4);
  });
  it("is null with nothing to fit", () => expect(yRange([], null)).toBeNull());
});

describe("monotoneTangents", () => {
  it("flattens at a local extreme, so the curve cannot overshoot a print", () => {
    const m = monotoneTangents([0, 1, 2], [0, 10, 0], 3);
    expect(m[1]).toBe(0);
  });
});

describe("tagY", () => {
  it("keeps the print tag at its line when the pill is clear of it", () => expect(tagY(50, 150, 18, 26, 0, 200)).toBe(50));
  it("steps the print tag past the pill when they would cover each other", () => {
    const y = tagY(100, 104, 18, 26, 0, 200);
    expect(Math.abs(y - 104)).toBeGreaterThanOrEqual(22);
  });
});

describe("ticks and figures", () => {
  it("picks a nice price step", () => expect(priceTicks(83_200, 83_290, 4).step).toBe(20));
  it("picks the smallest time step that keeps labels apart", () => expect(timeTicks({ fromMs: 0, toMs: 3 * MIN }, 600, 84).stepMs).toBe(30_000));
  it("shows a sub-dollar coin to five places and cuts rather than rounds, as the headline does", () => {
    expect(displayDecimals(0.11945)).toBe(5);
    expect(displayDecimals(237.45)).toBe(2);
    expect(truncate(0.119459, 5)).toBe(0.11945);
    expect(truncate(-1.239, 2)).toBe(-1.23);
  });
});
