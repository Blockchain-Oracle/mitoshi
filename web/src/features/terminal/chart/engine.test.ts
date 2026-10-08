// Ported from Owarine ecb7565b:web/src/features/terminal/chart/engine.test.ts — unchanged.
import { describe, expect, it } from "vitest";
import { catmullRom, easeFor, formatSigned, gridTicks, labelDecimals, niceStep, priceDecimals, rollFrame, rollTarget, SampleRing, stepFor, yOf } from "./engine";

describe("chart engine maths (Tradash model)", () => {
  it("nice steps cut at 1.5 / 3.5 / 7.5", () => {
    expect(niceStep(1.4)).toBe(1);
    expect(niceStep(1.6)).toBe(2);
    expect(niceStep(3.6)).toBe(5);
    expect(niceStep(7.6)).toBe(10);
    expect(stepFor(83_700)).toBe(10);
    expect(stepFor(2_580)).toBe(0.2);
  });

  it("price decimals by magnitude", () => {
    expect(priceDecimals(120_000)).toBe(1);
    expect(priceDecimals(83_700)).toBe(2);
    expect(priceDecimals(45.1)).toBe(3);
    expect(priceDecimals(3.45)).toBe(4);
    expect(priceDecimals(0)).toBe(2);
    expect(priceDecimals(0.000123)).toBe(7);
    expect(labelDecimals(2_580, 0.2)).toBe(2);
    expect(labelDecimals(0.5, 0.0001)).toBe(4);
  });

  it("signed money uses a true minus", () => {
    expect(formatSigned(3.7)).toBe("+$3.70");
    expect(formatSigned(-5.744)).toBe("−$5.74");
    expect(formatSigned(3.4521, 4)).toBe("+$3.4521");
  });

  it("the ring keeps the newest samples, oldest first", () => {
    const r = new SampleRing(3);
    r.push(1);
    r.push(2);
    r.push(3);
    r.push(4);
    expect([r.at(0), r.at(1), r.at(2)]).toEqual([2, 3, 4]);
    r.fill(9);
    expect(r.length).toBe(3);
    expect(r.at(2)).toBe(9);
  });

  it("the y-window centres the price", () => {
    const w = { center: 100, half: 10, top: 0, bottom: 200 };
    expect(yOf(100, w)).toBe(100);
    expect(yOf(110, w)).toBe(0);
    expect(yOf(90, w)).toBe(200);
  });

  it("easing is per 60 Hz sample whatever the frame length", () => {
    expect(easeFor(0.18, 1000 / 60)).toBeCloseTo(0.18);
    expect(1 - (1 - easeFor(0.18, 1000 / 120)) ** 2).toBeCloseTo(0.18);
  });

  it("Catmull-Rom control points sit a sixth of the neighbour span away", () => {
    const xs = [0, 1, 2, 3];
    const ys = [0, 0, 6, 6];
    expect(catmullRom(xs, ys, 1)).toEqual([1 + 2 / 6, 1, 2 - 2 / 6, 5]);
  });

  it("grid ticks mark every fifth as major", () => {
    const t = gridTicks(0, 10, 10);
    expect(t.filter((x) => x.major).map((x) => x.value)).toEqual([0, 10]);
    expect(t).toHaveLength(6);
    expect(gridTicks(0, 1e6, 1)).toEqual([]);
  });

  it("digits roll up on a rise and down on a fall", () => {
    expect(rollTarget(9, 9, 0, 1)).toBe(10);
    expect(rollTarget(0, 0, 9, -1)).toBe(-1);
    expect(rollTarget(3, 3, 5, 0)).toBe(5);
    expect(rollFrame(9.25)).toEqual({ digit: 9, next: 0, frac: 0.25 });
    expect(rollFrame(-0.5)).toEqual({ digit: 9, next: 0, frac: 0.5 });
  });
});
