import { describe, expect, it } from "vitest";
import { backoffMs, INITIAL, isConnectionKind, onFailure, onOnline, onRetry, onSuccess, stripView } from "./connection-core";

describe("the page's connection", () => {
  it("backs off 2 → 4 → 8 → 16 → 30 s within ±20 %, never under the RPC's hint", () => {
    expect([0, 1, 2, 3, 4, 9].map((a) => backoffMs(a, 0))).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
    expect(backoffMs(0, 1)).toBe(2_400);
    expect(backoffMs(0, -1)).toBe(1_600);
    expect(backoffMs(0, 0, 5_000)).toBe(5_000);
  });
  it("shows a failure only after 1.5 s, and hides it on the first success", () => {
    const failing = onFailure(INITIAL, "rate-limited", 10_000, 0);
    expect(stripView(failing, 10_500)).toEqual({ state: "hidden" });
    expect(stripView(failing, 11_600)).toEqual({ state: "reconnecting", nextRetryAtMs: 12_000, attempt: 0 });
    const retried = onRetry(failing, 12_000, 0);
    expect(stripView(retried, 12_100)).toEqual({ state: "retrying" });
    expect(onFailure(retried, "rate-limited", 12_300, 0).failing?.nextRetryAtMs).toBe(16_000);
    expect(stripView(onSuccess(retried, 12_500), 12_500)).toEqual({ state: "hidden" });
  });
  it("says offline at once, from the last live read", () => {
    const live = onSuccess(INITIAL, 5_000);
    expect(stripView(onOnline(live, false, 9_000), 9_000)).toEqual({ state: "offline", sinceMs: 5_000 });
    expect(stripView(onOnline(onOnline(live, false, 9_000), true, 9_500), 9_500)).toEqual({ state: "hidden" });
  });
  it("keeps domain failures out", () => {
    expect(isConnectionKind("rate-limited")).toBe(true);
    expect(isConnectionKind("contract-revert")).toBe(false);
    expect(isConnectionKind("not-deployed")).toBe(false);
  });
});
