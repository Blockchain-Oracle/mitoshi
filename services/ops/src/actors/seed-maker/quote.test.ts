import { describe, expect, it } from "vitest";
import { inExitTail, makerPhase, needsRequote, quoteExpirySec, STOP_BEFORE_LOCK_SEC, TAIL_FROM_LOCK_SEC, tailHalfSpread, tailLots } from "./quote";

const LOCK = 1_000_000;
const phase = (nowSec: number) => makerPhase({ nowSec, lockAtSec: LOCK, inSession: true, closesAtSec: null, spotFresh: true });

describe("the maker's last minute (D-194, S24.4)", () => {
  it("quotes in full until lock − 75, in the exit tail until lock − 45, then stops", () => {
    expect(phase(LOCK - 120)).toBe("quote");
    expect(inExitTail(LOCK - 120, LOCK)).toBe(false);
    expect(phase(LOCK - TAIL_FROM_LOCK_SEC)).toBe("quote");
    expect(inExitTail(LOCK - TAIL_FROM_LOCK_SEC, LOCK)).toBe(true);
    expect(inExitTail(LOCK - STOP_BEFORE_LOCK_SEC - 1, LOCK)).toBe(true);
    expect(phase(LOCK - STOP_BEFORE_LOCK_SEC)).toBe("stop");
    expect(inExitTail(LOCK - STOP_BEFORE_LOCK_SEC, LOCK)).toBe(false);
  });
  it("still pulls everything near a session close and on a stale spot", () => {
    expect(makerPhase({ nowSec: LOCK - 70, lockAtSec: LOCK, inSession: true, closesAtSec: LOCK, spotFresh: true })).toBe("pull");
    expect(makerPhase({ nowSec: LOCK - 70, lockAtSec: LOCK, inSession: true, closesAtSec: null, spotFresh: false })).toBe("pull");
  });
  it("quotes the tail small and wide, every placement living at least 15 s", () => {
    expect(tailHalfSpread(30)).toBe(60);
    expect(tailHalfSpread(10)).toBe(40);
    expect(tailLots(5_000n, 1n)).toBe(2_500n);
    expect(tailLots(1n, 1n)).toBe(1n);
    const lastPlacement = LOCK - STOP_BEFORE_LOCK_SEC - 1;
    expect(quoteExpirySec(lastPlacement, LOCK, 120) - lastPlacement).toBeGreaterThanOrEqual(14);
  });
  it("never churns a pair that already rests to lock − 30, but still refreshes one that can live longer", () => {
    const toLock = { fairTicks: 500, expireSec: LOCK - 30, halfSpreadTicks: 60 };
    expect(needsRequote({ placed: toLock, fairTicks: 500, nowSec: LOCK - 50, requoteTicks: 10, halfSpreadTicks: 60, lockAtSec: LOCK })).toBe(false);
    expect(needsRequote({ placed: toLock, fairTicks: 520, nowSec: LOCK - 50, requoteTicks: 10, halfSpreadTicks: 60, lockAtSec: LOCK })).toBe(true);
    const early = { fairTicks: 500, expireSec: LOCK - 400, halfSpreadTicks: 30 };
    expect(needsRequote({ placed: early, fairTicks: 500, nowSec: LOCK - 410, requoteTicks: 10, halfSpreadTicks: 30, lockAtSec: LOCK })).toBe(true);
    expect(needsRequote({ placed: { ...early, expireSec: LOCK - 30 }, fairTicks: 500, nowSec: LOCK - 70, requoteTicks: 10, halfSpreadTicks: 60, lockAtSec: LOCK })).toBe(true);
  });
});
