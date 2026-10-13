/**
 * D-230 item 6: the app clock never freezes. A page hidden from its load (an app's web view that never sends
 * `visibilitychange`) still moves its countdowns and its phases; a page in use ticks every second whatever
 * `visibilityState` claims; a tab hidden after it was seen ticks nothing (AD-6) and re-reads the moment it returns.
 */
import { phase } from "@cwf/core/lifecycle";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Doc = EventTarget & { visibilityState: "visible" | "hidden" };

async function freshClock(visibility: "visible" | "hidden") {
  vi.resetModules();
  const doc = Object.assign(new EventTarget(), { visibilityState: visibility }) as Doc;
  const win = new EventTarget();
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  const clock = await import("./clock");
  return { clock, doc, win };
}

const T0 = Date.UTC(2026, 9, 13, 15, 4, 57);

describe("the app clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("hidden at load and never told otherwise, it still moves: a Window turns from upcoming to trading", async () => {
    const { clock } = await freshClock("hidden");
    const startSec = T0 / 1000 + 3;
    const market = { tradingStartSec: startSec, lockAtSec: startSec + 300, expirySec: startSec + 300, intervalSec: 300, openingPriceRaw: 10_682_000_000n, state: "open" as const };
    const seen: string[] = [];
    const unsubscribe = clock.clockStore.subscribe(() => seen.push(phase(market, clock.clockStore.snapshot())));
    expect(phase(market, clock.clockStore.snapshot())).toBe("upcoming");
    expect(clock.clockStore.tickMs()).toBe(clock.HIDDEN_AT_LOAD_TICK_MS);
    vi.advanceTimersByTime(10_000);
    expect(clock.clockStore.snapshot()).toBeGreaterThanOrEqual(T0 + 10_000);
    expect(seen.at(-1)).toBe("trading");
    unsubscribe();
  });

  it("a pointer, a key or focus on a page that claims to be hidden starts the one-second tick", async () => {
    const { clock, win } = await freshClock("hidden");
    const unsubscribe = clock.clockStore.subscribe(() => undefined);
    win.dispatchEvent(new Event("pointerdown"));
    expect(clock.clockStore.tickMs()).toBe(clock.TICK_MS);
    vi.advanceTimersByTime(3_000);
    expect(clock.clockStore.snapshot()).toBe(T0 + 3_000);
    unsubscribe();
  });

  it("visible, it ticks every second; hidden after being seen, it stops; back, it re-reads at once", async () => {
    const { clock, doc } = await freshClock("visible");
    const unsubscribe = clock.clockStore.subscribe(() => undefined);
    expect(clock.clockStore.tickMs()).toBe(clock.TICK_MS);
    vi.advanceTimersByTime(2_000);
    expect(clock.clockStore.snapshot()).toBe(T0 + 2_000);
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(clock.clockStore.tickMs()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(clock.clockStore.snapshot()).toBe(T0 + 2_000);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(clock.clockStore.snapshot()).toBe(T0 + 62_000);
    unsubscribe();
  });

  it("applies the chain-clock offset to every read", async () => {
    const { clock } = await freshClock("visible");
    const unsubscribe = clock.clockStore.subscribe(() => undefined);
    clock.setClockOffset(-1_500);
    expect(clock.clockStore.snapshot()).toBe(T0 - 1_500);
    expect(clock.nowMs()).toBe(T0 - 1_500);
    unsubscribe();
  });
});
