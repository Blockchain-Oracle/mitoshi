import { describe, expect, it } from "vitest";
import { lineGeometry, smooth } from "./sparkline";

describe("lineGeometry", () => {
  const pts = [
    { t: 0, p: 100 },
    { t: 50, p: 110 },
    { t: 100, p: 105 },
  ];
  it("draws the points in the box with the open inside the scale", () => {
    const g = lineGeometry(pts, 200, 100, 90, 100, 100);
    expect(g.d.startsWith("M0.0,")).toBe(true);
    expect(g.last?.x).toBe(200);
    expect(g.openY).not.toBeNull();
    expect(g.openY!).toBeGreaterThan(0);
    expect(g.openY!).toBeLessThan(100);
    expect(g.labels).toHaveLength(3);
  });
  it("draws nothing with no points and no open", () => {
    expect(lineGeometry([], 200, 100, null, 100, 100).d).toBe("");
  });
});

describe("smooth", () => {
  it("averages each bucket, the newest too, at its newest tick's time", () => {
    const pts = [{ t: 0, p: 100 }, { t: 1, p: 104 }, { t: 10, p: 200 }, { t: 11, p: 210 }];
    const out = smooth(pts, 0, 20, 2);
    expect(out[0]).toEqual({ t: 1, p: 102 });
    expect(out.at(-1)).toEqual({ t: 11, p: 205 });
  });
});
