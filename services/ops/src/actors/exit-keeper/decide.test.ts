import { describe, expect, it } from "vitest";
import { judge, leadTicks, retryDelayMs, trailStep, type Armed } from "./decide";

const E8 = 100_000_000n;
const UP: Armed = { side: "up", takeProfitBase: 1_500_000n, stopLossBase: 400_000n, trailBps: 50 };
const LIVE = { trading: true, lockAtSec: 2_000, lotBase: 1_000n };

describe("the exit keeper", () => {
  it("steps a trail on display ticks: follows the spot 0.5 % behind, never back, and hits at the stop", () => {
    const stop = 81_000n * E8;
    expect(trailStep(UP, stop, 81_500n * E8)).toEqual({ kind: "move", stopE8: 81_092_500_000_00n });
    expect(trailStep(UP, stop, 81_200n * E8)).toEqual({ kind: "hold" });
    expect(trailStep(UP, stop, 81_000n * E8)).toEqual({ kind: "hit" });
    const down: Armed = { ...UP, side: "down" };
    expect(trailStep(down, stop, 80_000n * E8)).toEqual({ kind: "move", stopE8: 80_400n * E8 });
    expect(trailStep(down, stop, 81_000n * E8)).toEqual({ kind: "hit" });
    expect(trailStep({ ...UP, trailBps: null }, stop, 70_000n * E8)).toEqual({ kind: "hold" });
  });

  it("ends a trigger whose Window locked or whose holding is gone, then fires trail, TP and SL", () => {
    expect(judge(UP, { heldRaw: 5_000n, window: { ...LIVE, trading: false }, exit: null }, 1_000, false)).toMatchObject({ kind: "close", status: "expired" });
    expect(judge(UP, { heldRaw: 5_000n, window: LIVE, exit: null }, 2_000, false)).toMatchObject({ kind: "close", status: "expired" });
    expect(judge(UP, { heldRaw: 999n, window: LIVE, exit: { proceedsBase: 2_000_000n, contractsRaw: 5_000n } }, 1_000, true)).toMatchObject({ kind: "close", status: "gone" });
    expect(judge(UP, { heldRaw: 5_000n, window: null, exit: null }, 1_000, true)).toMatchObject({ kind: "wait" });
    expect(judge(UP, { heldRaw: 5_000n, window: LIVE, exit: { proceedsBase: 900_000n, contractsRaw: 5_000n } }, 1_000, true)).toEqual({ kind: "fire", reason: "trail" });
    expect(judge(UP, { heldRaw: 5_000n, window: LIVE, exit: { proceedsBase: 1_500_000n, contractsRaw: 5_000n } }, 1_000, false)).toEqual({ kind: "fire", reason: "tp" });
    expect(judge(UP, { heldRaw: 5_000n, window: LIVE, exit: { proceedsBase: 400_000n, contractsRaw: 5_000n } }, 1_000, false)).toEqual({ kind: "fire", reason: "sl" });
    expect(judge(UP, { heldRaw: 5_000n, window: LIVE, exit: { proceedsBase: 900_000n, contractsRaw: 5_000n } }, 1_000, false)).toEqual({ kind: "watch" });
    expect(judge(UP, { heldRaw: 5_000n, window: LIVE, exit: null }, 1_000, false)).toEqual({ kind: "watch" });
  });

  it("judges TP and SL like for like on a thin book: the part that fills, at its price, on the whole holding (D-227)", () => {
    // 5,000 held, the book takes 1,500 for 300,000: worth 1,000,000 held — above the 400,000 stop, under the TP.
    expect(judge(UP, { heldRaw: 5_000n, window: LIVE, exit: { proceedsBase: 300_000n, contractsRaw: 1_500n } }, 1_000, false)).toEqual({ kind: "watch" });
    // 1,500 for 450,000 is 1,500,000 on all 5,000: the take-profit fires.
    expect(judge(UP, { heldRaw: 5_000n, window: LIVE, exit: { proceedsBase: 450_000n, contractsRaw: 1_500n } }, 1_000, false)).toEqual({ kind: "fire", reason: "tp" });
    // A real drawdown still fires: 1,500 for 120,000 is 400,000 on all of it.
    expect(judge(UP, { heldRaw: 5_000n, window: LIVE, exit: { proceedsBase: 120_000n, contractsRaw: 1_500n } }, 1_000, false)).toEqual({ kind: "fire", reason: "sl" });
  });

  it("backs a failed sale off, capped", () => {
    expect(retryDelayMs(0)).toBe(2_000);
    expect(retryDelayMs(3)).toBe(6_000);
    expect(retryDelayMs(50)).toBe(20_000);
  });

  it("leads the floor by the clock's drift: 3 ticks, or 1.5 % of a dear side, never past 99.9 ¢", () => {
    expect(leadTicks(100)).toBe(3);
    expect(leadTicks(463)).toBe(7);
    expect(leadTicks(900)).toBe(14);
    expect(leadTicks(995)).toBe(4);
  });
});
