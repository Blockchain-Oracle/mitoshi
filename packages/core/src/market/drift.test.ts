// Ported from Agari 03b30ab:packages/core/src/market/drift.test.ts
import { describe, expect, it } from "vitest";
import { computeDrift, type DriftPoint } from "./drift";

const T0 = 1_800_000_000;
const FLAT_BAND = 300n; // $3.00 at the oracle's cent scale, the reference's own band

const at = (minutes: number, dollars: number): DriftPoint => ({ timeSec: T0 + minutes * 60, valueRaw: BigInt(Math.round(dollars * 100)) });

describe("computeDrift", () => {
  it("needs two samples to say anything", () => {
    expect(computeDrift([], 15, FLAT_BAND)).toBeNull();
    expect(computeDrift([at(0, 100)], 15, FLAT_BAND)).toBeNull();
  });

  it("measures from the first sample inside the window", () => {
    const points = [at(0, 100), at(10, 90), at(20, 120), at(30, 140)];
    // A 15-minute window off the latest sample (t=30) cuts at t=15, so t=20 is the base.
    expect(computeDrift(points, 15, FLAT_BAND)).toEqual({ moveRaw: 2_000n, spanMin: 10, direction: "up" });
  });

  it("never claims a longer span than the history holds", () => {
    // Asked for 60 minutes; only 4 exist. The label must say 4, not 60 — otherwise
    // a thin history reads as an hour of confirmation it does not have.
    const points = [at(0, 100), at(4, 108)];
    expect(computeDrift(points, 60, FLAT_BAND)).toMatchObject({ spanMin: 4, direction: "up" });
  });

  it("reads a move inside the flat band as flat, in either direction", () => {
    expect(computeDrift([at(0, 100), at(1, 102)], 15, FLAT_BAND)?.direction).toBe("flat");
    expect(computeDrift([at(0, 100), at(1, 98)], 15, FLAT_BAND)?.direction).toBe("flat");
    // Exactly on the band is still flat; a cent past it is a direction.
    expect(computeDrift([at(0, 100), at(1, 103)], 15, FLAT_BAND)?.direction).toBe("flat");
    expect(computeDrift([at(0, 100), at(1, 103.01)], 15, FLAT_BAND)?.direction).toBe("up");
  });

  it("signs a fall correctly", () => {
    expect(computeDrift([at(0, 100), at(5, 80)], 15, FLAT_BAND)).toEqual({ moveRaw: -2_000n, spanMin: 5, direction: "down" });
  });
});
