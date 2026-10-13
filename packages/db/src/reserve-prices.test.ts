import { describe, expect, it } from "vitest";
import { downsample } from "./reserve-prices";

describe("downsample", () => {
  it("keeps rows that already fit", () => {
    expect(downsample([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it("thins evenly and keeps the first and the last exact", () => {
    const rows = Array.from({ length: 1001 }, (_, i) => i);
    const out = downsample(rows, 300);
    expect(out).toHaveLength(300);
    expect(out[0]).toBe(0);
    expect(out[299]).toBe(1000);
    for (let i = 1; i < out.length; i++) expect(out[i]!).toBeGreaterThan(out[i - 1]!);
  });

  it("two points: the ends", () => {
    expect(downsample([5, 6, 7, 8], 2)).toEqual([5, 8]);
  });
});
