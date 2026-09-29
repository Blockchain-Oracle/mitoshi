// Ported from Masayume 68f7a09:packages/core/src/sizing/admissibility.test.ts
import { describe, expect, it } from "vitest";
import { admissibilityBlocker, isAdmissibleBps } from "./admissibility";

describe("admissibility band", () => {
  it("is inclusive at both edges: 2% ≤ p ≤ 97%", () => {
    expect(isAdmissibleBps(199)).toBe(false);
    expect(isAdmissibleBps(200)).toBe(true);
    expect(isAdmissibleBps(9700)).toBe(true);
    expect(isAdmissibleBps(9701)).toBe(false);
  });

  it("names which edge blocks", () => {
    expect(admissibilityBlocker(199)).toBe("outside-band-low");
    expect(admissibilityBlocker(9701)).toBe("outside-band-high");
    expect(admissibilityBlocker(5000)).toBeNull();
  });
});
