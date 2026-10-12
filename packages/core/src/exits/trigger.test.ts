import { describe, expect, it } from "vitest";
import { exitHit, likeForLikeBase, ratchet, trailHit } from "./rules";
import { exitTriggerFromWire, exitTriggerMessage, exitTriggerProblem, exitTriggerToWire, isExitCancel, MAX_EXIT_TRIGGER_SEC, type ExitTrigger } from "./trigger";
import { exitTriggerWireSchema } from "./trigger-schema";

const NOW_MS = 1_791_489_000_000;
const T: ExitTrigger = {
  owner: "0xB36000000000000000000000000000000000C193",
  vault: "0x6f05b0dcaa31c241a4f6e8ceb170090b41679e95",
  chainId: 42431,
  market: `0x${"ab".repeat(32)}`,
  side: "up",
  grantId: 7n,
  takeProfitBase: 1_500_000n,
  stopLossBase: 400_000n,
  trailBps: 50,
  trailStopE8: 8_150_000_000_000n,
  nonce: BigInt(NOW_MS),
  expiresAtSec: NOW_MS / 1000 + 240,
};

describe("exit triggers", () => {
  it("round-trips the wire shape and signs an unset target as 0", () => {
    const wire = exitTriggerToWire(T);
    expect(exitTriggerWireSchema.parse(JSON.parse(JSON.stringify(wire)))).toEqual(wire);
    expect(exitTriggerFromWire(wire)).toEqual(T);
    const m = exitTriggerMessage({ ...T, side: "down", takeProfitBase: null, trailBps: null, trailStopE8: null });
    expect(m).toMatchObject({ side: 1, takeProfitBase: 0n, trailBps: 0, trailStopE8: 0n, expiresAtSec: BigInt(T.expiresAtSec) });
  });

  it("refuses a trigger the keeper could not honour, and reads an empty one as a cancel", () => {
    expect(exitTriggerProblem(T, NOW_MS)).toBeNull();
    expect(exitTriggerProblem({ ...T, expiresAtSec: NOW_MS / 1000 }, NOW_MS)).toMatch(/expired/);
    expect(exitTriggerProblem({ ...T, expiresAtSec: NOW_MS / 1000 + MAX_EXIT_TRIGGER_SEC + 1 }, NOW_MS)).toMatch(/too far/);
    expect(exitTriggerProblem({ ...T, nonce: BigInt(NOW_MS + 61_000) }, NOW_MS)).toMatch(/nonce/);
    expect(exitTriggerProblem({ ...T, takeProfitBase: 300_000n }, NOW_MS)).toMatch(/above the stop-loss/);
    expect(exitTriggerProblem({ ...T, trailStopE8: null }, NOW_MS)).toMatch(/both/);
    expect(exitTriggerProblem({ ...T, trailBps: 5 }, NOW_MS)).toMatch(/behind the spot/);
    const cancel = { ...T, takeProfitBase: null, stopLossBase: null, trailBps: null, trailStopE8: null };
    expect(isExitCancel(cancel)).toBe(true);
    expect(exitTriggerProblem(cancel, NOW_MS)).toBeNull();
  });

  it("the rules: a trail ratchets only in the position's favour; TP and SL read what Close pays", () => {
    expect(ratchet("up", 100, 110, 0.05)).toBeCloseTo(104.5);
    expect(ratchet("up", 104.5, 101, 0.05)).toBe(104.5);
    expect(ratchet("down", 100, 90, 0.05)).toBeCloseTo(94.5);
    expect(trailHit("up", 104.5, 104.5)).toBe(true);
    expect(trailHit("down", 94.5, 94.4)).toBe(false);
    expect(exitHit(1_500_000n, 1_500_000n, 400_000n)).toBe("tp");
    expect(exitHit(400_000n, 1_500_000n, 400_000n)).toBe("sl");
    expect(exitHit(900_000n, 1_500_000n, null)).toBeNull();
  });

  it("judges an exit like for like: a thin book's proceeds scaled to everything held at the same price (D-227)", () => {
    // 10 held, the book takes 3 for $1.50 (50¢): the trigger reads $5.00, not $1.50 — a $4.00 stop-loss holds.
    expect(likeForLikeBase(1_500_000n, 3_000_000n, 10_000_000n)).toBe(5_000_000n);
    expect(exitHit(likeForLikeBase(1_500_000n, 3_000_000n, 10_000_000n)!, null, 4_000_000n)).toBeNull();
    expect(exitHit(1_500_000n, null, 4_000_000n)).toBe("sl");
    // Everything fills: the proceeds themselves. Nothing fills: no value to judge.
    expect(likeForLikeBase(4_200_000n, 10_000_000n, 10_000_000n)).toBe(4_200_000n);
    expect(likeForLikeBase(0n, 0n, 10_000_000n)).toBeNull();
  });
});
