// Ported from Owarine ecb7565b:services/ops/src/http/coalesce.test.ts — unchanged.
import { describe, expect, it } from "vitest";
import { createCoalescer, type CoalesceClock } from "./coalesce";

function fakeClock() {
  let now = 0;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 1;
  const clock: CoalesceClock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimeout: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
  };
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > until) break;
      timers.shift();
      now = next.at;
      next.fn();
    }
    now = until;
  };
  return { clock, advance, pending: () => timers.length };
}

describe("createCoalescer", () => {
  it("sends the first value at once and the newest value at the end of the gap", () => {
    const { clock, advance } = fakeClock();
    const sent: Array<[string, number, number]> = [];
    const c = createCoalescer<number>((k, v) => sent.push([k, v, clock.now()]), 125, clock);
    c.push("BTC", 1);
    advance(10);
    c.push("BTC", 2);
    advance(10);
    c.push("BTC", 3);
    expect(sent).toEqual([["BTC", 1, 0]]);
    advance(200);
    expect(sent).toEqual([["BTC", 1, 0], ["BTC", 3, 125]]);
  });

  it("caps a burst at one frame per gap and never drops the last value", () => {
    const { clock, advance } = fakeClock();
    const sent: number[] = [];
    const c = createCoalescer<number>((_, v) => sent.push(v), 125, clock);
    for (let i = 1; i <= 40; i++) {
      c.push("BTC", i);
      advance(25);
    }
    advance(500);
    expect(sent.length).toBeLessThanOrEqual(9);
    expect(sent.at(-1)).toBe(40);
  });

  it("keeps keys independent and stops cleanly", () => {
    const { clock, advance, pending } = fakeClock();
    const sent: string[] = [];
    const c = createCoalescer<number>((k, v) => sent.push(`${k}${v}`), 125, clock);
    c.push("BTC", 1);
    c.push("ETH", 1);
    c.push("BTC", 2);
    expect(sent).toEqual(["BTC1", "ETH1"]);
    c.stop();
    expect(pending()).toBe(0);
    advance(500);
    c.push("BTC", 3);
    expect(sent).toEqual(["BTC1", "ETH1"]);
  });
});
