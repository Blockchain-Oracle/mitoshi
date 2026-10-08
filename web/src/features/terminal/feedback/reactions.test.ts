// Ported from Owarine ecb7565b:web/src/features/terminal/feedback/reactions.test.ts — unchanged.
import { describe, expect, it } from "vitest";
import { ReactionEngine, type ReactionPosition } from "./reactions";

const pos = (o: Partial<ReactionPosition> = {}): ReactionPosition => ({ key: "k", side: 1, pnl: 0, margin: 100, entry: 100_000, line: null, ...o });

/** Feeds a calm market (±1 alternating) for `n` ticks at 200 ms. */
function warm(e: ReactionEngine, n: number, start = 100_000, t0 = 0, position: ReactionPosition | null = null) {
  for (let i = 0; i < n; i++) e.feed({ t: t0 + i * 200, price: start + (i % 2), position });
  return t0 + n * 200;
}

describe("ReactionEngine", () => {
  it("is silent with no position", () => {
    const e = new ReactionEngine(() => 0);
    warm(e, 20);
    expect(e.feed({ t: 10_000, price: 100_500, position: null })).toEqual([]);
  });

  it("climbs a combo on favourable steps and resets on an adverse one", () => {
    const e = new ReactionEngine(() => 0);
    let t = warm(e, 20);
    const steps: number[] = [];
    let p = 100_000;
    for (let i = 0; i < 4; i++) {
      p += 10;
      const r = e.feed({ t: (t += 200), price: p, position: pos({ pnl: 1 + i }) });
      for (const x of r) if (x.kind === "step") steps.push(x.favorable ? x.count : -x.count);
    }
    // The first sight sets the anchor; the next three moves are steps.
    expect(steps).toEqual([1, 2, 3]);
    const back = e.feed({ t: (t += 200), price: p - 10, position: pos({ pnl: 1 }) }).find((x) => x.kind === "step");
    expect(back).toEqual({ kind: "step", favorable: false, count: 1 });
  });

  it("fires a surge after enough samples, then cools down for 3 s", () => {
    const e = new ReactionEngine(() => 0);
    let t = warm(e, 30);
    const position = pos();
    const all = [...e.feed({ t: (t += 200), price: 100_000, position })];
    for (let i = 1; i <= 8; i++) all.push(...e.feed({ t: (t += 200), price: 100_000 + i * 12, position }));
    // One favourable surge in the ramp; the rest of it falls inside the 3 s cooldown.
    expect(all.filter((x) => x.kind === "surge")).toEqual([{ kind: "surge", favorable: true, mega: false }]);
    t += 3_200;
    const down = e.feed({ t, price: 99_900, position });
    expect(down.some((x) => x.kind === "surge" && !x.favorable)).toBe(false);
  });

  it("gates callouts: quiet for 1.2 s, then a milestone shows", () => {
    const e = new ReactionEngine(() => 0);
    let t = warm(e, 20);
    expect(e.feed({ t: (t += 200), price: 100_000, position: pos({ pnl: 0 }) }).filter((x) => x.kind === "callout")).toEqual([]);
    expect(e.feed({ t: (t += 200), price: 100_001, position: pos({ pnl: 11 }) }).filter((x) => x.kind === "callout")).toEqual([]);
    t += 1_500;
    const later = e.feed({ t, price: 100_001, position: pos({ pnl: 26 }) }).filter((x) => x.kind === "callout");
    expect(later).toEqual([{ kind: "callout", tone: "great", emoji: "🤑", text: "+25%!" }]);
  });

  it("pre-counts milestones already passed when a position is first seen", () => {
    const e = new ReactionEngine(() => 0);
    let t = warm(e, 20);
    e.feed({ t: (t += 200), price: 100_000, position: pos({ pnl: 60 }) });
    t += 2_000;
    expect(e.feed({ t, price: 100_000, position: pos({ pnl: 60 }) }).filter((x) => x.kind === "callout")).toEqual([]);
  });

  it("warns near the line once, and re-arms past 40 %", () => {
    const e = new ReactionEngine(() => 0);
    let t = warm(e, 20);
    const line = { entry: 100_100, line: 100_000 };
    e.feed({ t: (t += 200), price: 100_100, position: pos(line) });
    t += 1_500;
    const warn = e.feed({ t, price: 100_020, position: pos(line) }).find((x) => x.kind === "callout");
    expect(warn).toMatchObject({ tone: "warn", text: "Near the line" });
    t += 1_000;
    expect(e.feed({ t, price: 100_019, position: pos(line) }).some((x) => x.kind === "callout")).toBe(false);
  });
});
