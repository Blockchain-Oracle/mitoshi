import { sigmaE8FromBps, CALENDAR_YEAR_SEC } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { breakEvenSpotE8, closeFloorBase, exitHit, liveValue, pnlOf, ratchet, spotForValueE8, trailEligible, trailHit, trailStart } from "./position-value";

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

describe("break-even and Trail (23e)", () => {
  it("finds the spot where Close pays the cost back, on the right side of the anchor", () => {
    // Bought for $5.40, Close pays $5.20 at the open: Up breaks even a little above the line, Down a little below.
    const up = breakEvenSpotE8({ anchor, costBase: 5_400_000n, side: "up", openE8: OPEN, sigmaE8: SIGMA, tauSec: 200 })!;
    expect(up > OPEN).toBe(true);
    const v = liveValue({ anchor, side: "up", spotE8: up, openE8: OPEN, sigmaE8: SIGMA, tauSec: 200 });
    expect(v.valueBase).toBe(5_200_000n); // the shown value never rises above the read…
    const down = breakEvenSpotE8({ anchor, costBase: 5_400_000n, side: "down", openE8: OPEN, sigmaE8: SIGMA, tauSec: 200 })!;
    expect(down < OPEN).toBe(true);
    expect(breakEvenSpotE8({ anchor, costBase: 5_400_000n, side: "up", openE8: OPEN, sigmaE8: null, tauSec: 200 })).toBeNull();
  });

  it("arms only past break-even by more than the distance, ratchets one way, and hits on the way back", () => {
    expect(trailEligible("up", 100.2, 100, 0.001)).toBe(true);
    expect(trailEligible("up", 100.05, 100, 0.001)).toBe(false);
    expect(trailEligible("down", 99.8, 100, 0.001)).toBe(true);
    expect(trailStart("up", 100.2, 100, 0.001)).toBeCloseTo(100.0998);
    expect(trailStart("up", 100.05, 100, 0.001)).toBe(100);
    expect(ratchet("up", 100.1, 100.5, 0.001)).toBeCloseTo(100.3995);
    expect(ratchet("up", 100.3, 100.2, 0.001)).toBe(100.3);
    expect(ratchet("down", 99.9, 99.5, 0.001)).toBeCloseTo(99.5995);
    expect(trailHit("up", 100.3, 100.29)).toBe(true);
    expect(trailHit("down", 99.6, 99.61)).toBe(true);
    expect(trailHit("up", 100.3, 100.31)).toBe(false);
  });
});

describe("take-profit and stop-loss on what Close pays (23e)", () => {
  it("hits on the exit value, TP at or above, SL at or below", () => {
    expect(exitHit(6_000_000n, 6_000_000n, 4_000_000n)).toBe("tp");
    expect(exitHit(4_000_000n, 6_000_000n, 4_000_000n)).toBe("sl");
    expect(exitHit(5_000_000n, 6_000_000n, 4_000_000n)).toBeNull();
    expect(exitHit(5_000_000n, null, null)).toBeNull();
  });
  it("draws a take-profit above the anchor for Up and a stop-loss below", () => {
    const tp = spotForValueE8({ anchor, targetBase: 6_000_000n, side: "up", openE8: OPEN, sigmaE8: SIGMA, tauSec: 200 })!;
    const sl = spotForValueE8({ anchor, targetBase: 4_000_000n, side: "up", openE8: OPEN, sigmaE8: SIGMA, tauSec: 200 })!;
    expect(tp > OPEN).toBe(true);
    expect(sl < OPEN).toBe(true);
  });
});
