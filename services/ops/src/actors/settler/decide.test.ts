// Adapted from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/settler/decide.test.ts
import { describe, expect, it } from "vitest";
import { decideSettle, type SettleInput } from "./decide";

const T = 1_800_000_000;
const base = (over: Partial<SettleInput> = {}): SettleInput => ({
  nowSec: T + 310, state: 0, expirySec: T + 300, lockAtSec: T + 300, openDeadlineSec: T + 900, closeDeadlineSec: T + 1_200,
  prints: { open: true, close: true, checkOpen: false, checkClose: false }, check: { configured: false, admissionSec: 0 },
  resolvedSec: 0, redeemGraceSec: 300, orderCount: 0, redeemable: [], ...over,
});

describe("settler decisions", () => {
  it("settles once both prints are in; waits out a configured check until its bound", () => {
    expect(decideSettle(base())).toMatchObject({ kind: "settle" });
    expect(decideSettle(base({ check: { configured: true, admissionSec: 120 } }))).toEqual({ kind: "wait", untilSec: T + 421, why: expect.stringContaining("cross-check") });
    expect(decideSettle(base({ nowSec: T + 421, check: { configured: true, admissionSec: 120 } }))).toMatchObject({ kind: "settle", why: expect.stringContaining("single source") });
  });

  it("voids a Window only after a missing print's deadline (E-51), and polls before", () => {
    expect(decideSettle(base({ nowSec: T + 800, prints: { open: false, close: true, checkOpen: false, checkClose: false } }))).toMatchObject({ kind: "wait", untilSec: T + 810 });
    expect(decideSettle(base({ nowSec: T + 901, prints: { open: false, close: false, checkOpen: false, checkClose: false } }))).toMatchObject({ kind: "void" });
    expect(decideSettle(base({ nowSec: T + 1_201, prints: { open: true, close: false, checkOpen: false, checkClose: false } }))).toMatchObject({ kind: "void" });
    expect(decideSettle(base({ nowSec: T + 100, prints: { open: true, close: false, checkOpen: false, checkClose: false } }))).toMatchObject({ kind: "wait", untilSec: T + 305 });
  });

  it("sweeps resting orders first, then pays holders only after the 300 s claim grace, in batches", () => {
    const terminal = { state: 1, resolvedSec: T + 320 };
    expect(decideSettle(base({ ...terminal, orderCount: 3, redeemable: ["0xa"] }))).toMatchObject({ kind: "sweep" });
    expect(decideSettle(base({ ...terminal, nowSec: T + 400, redeemable: ["0xa"] }))).toEqual({ kind: "wait", untilSec: T + 620, why: expect.any(String) });
    const holders = Array.from({ length: 8 }, (_, i) => `0x${i}`);
    expect(decideSettle(base({ ...terminal, nowSec: T + 620, redeemable: holders }))).toMatchObject({ kind: "redeemFor", holders: holders.slice(0, 6) });
    expect(decideSettle(base({ ...terminal, nowSec: T + 620 }))).toMatchObject({ kind: "done" });
  });
});
