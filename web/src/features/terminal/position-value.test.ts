import { sigmaE8FromBps, CALENDAR_YEAR_SEC } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { closeFloorBase, liveValue, pnlOf } from "./position-value";

const OPEN = 62_000n * 100_000_000n;
const SIGMA = sigmaE8FromBps(5_000, CALENDAR_YEAR_SEC);
const anchor = { proceedsBase: 5_200_000n, spotE8: OPEN };

describe("a position's live value (D-197)", () => {
  it("is the book read when the spot hasn't moved, or a model input is missing", () => {
    expect(liveValue({ anchor, side: "up", spotE8: OPEN, openE8: OPEN, sigmaE8: SIGMA, tauSec: 200 })).toEqual({ valueBase: 5_200_000n, approx: false });
    expect(liveValue({ anchor, side: "up", spotE8: OPEN + 1_000_000_000n, openE8: null, sigmaE8: SIGMA, tauSec: 200 }).approx).toBe(false);
    expect(liveValue({ anchor, side: "up", spotE8: OPEN + 1_000_000_000n, openE8: OPEN, sigmaE8: 0n, tauSec: 200 }).approx).toBe(false);
  });

  it("falls at once on an adverse move, marked ≈", () => {
    const down = liveValue({ anchor, side: "up", spotE8: OPEN - 3_000_000_000n, openE8: OPEN, sigmaE8: SIGMA, tauSec: 200 });
    expect(down.approx).toBe(true);
    expect(down.valueBase).toBeLessThan(5_200_000n);
    const forDown = liveValue({ anchor, side: "down", spotE8: OPEN + 3_000_000_000n, openE8: OPEN, sigmaE8: SIGMA, tauSec: 200 });
    expect(forDown.valueBase).toBeLessThan(5_200_000n);
  });

  it("never shows more than the book last paid on a favourable move", () => {
    expect(liveValue({ anchor, side: "up", spotE8: OPEN + 3_000_000_000n, openE8: OPEN, sigmaE8: SIGMA, tauSec: 200 })).toEqual({ valueBase: 5_200_000n, approx: false });
  });

  it("states PnL and ROI against the cost, and the Close floor less the tolerance", () => {
    expect(pnlOf(5_200_000n, 5_000_000n)).toEqual({ pnlBase: 200_000n, roiBps: 400 });
    expect(pnlOf(4_000_000n, 0n).roiBps).toBeNull();
    expect(closeFloorBase(5_000_000n, 100)).toBe(4_950_000n);
    expect(closeFloorBase(5_000_000n, 0)).toBe(5_000_000n);
  });
});
