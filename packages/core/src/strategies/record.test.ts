import { describe, expect, it } from "vitest";
import { thinCurve } from "./record";

describe("thinCurve", () => {
  it("keeps a short curve whole, and a long one's first and last points at most `max` points long", () => {
    expect(thinCurve([1, 2, 3], 5)).toEqual([1, 2, 3]);
    const long = Array.from({ length: 1_001 }, (_, i) => i);
    const thin = thinCurve(long, 5);
    expect(thin).toEqual([0, 250, 500, 750, 1_000]);
  });
});
