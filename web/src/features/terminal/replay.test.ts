// Ported from Owarine ecb7565b:web/src/features/terminal/replay.test.ts — unchanged.
import { describe, expect, it } from "vitest";
import { coverage, GAP_MS, halve, interpolateCandles, replayable, type Episode } from "./replay";

const ep = (times: number[]): Episode => ({ positionId: "p", marketId: "m", asset: "BTC", side: "up", intervalSec: 300, entrySpot: 1, line: 1, openedAtMs: 0, closedAtMs: 1, samples: times.map((t) => [t, 1, 0]) });

describe("replays", () => {
  it("halves past 900 samples, keeping the last", () => {
    const s = Array.from({ length: 901 }, (_, i) => [i, 1, 0] as [number, number, number]);
    const h = halve(s);
    expect(h.length).toBe(451);
    expect(h.at(-1)![0]).toBe(900);
  });
  it("counts gaps as uncovered", () => {
    expect(coverage(ep([0, 100, 200, 200 + GAP_MS + 1, 200 + GAP_MS + 101]))).toBeCloseTo(300 / (GAP_MS + 301));
  });
  it("needs 30 samples, 60 % coverage and no gap in the middle 80 %", () => {
    expect(replayable(ep(Array.from({ length: 40 }, (_, i) => i * 100)))).toBe(true);
    expect(replayable(ep(Array.from({ length: 20 }, (_, i) => i * 100)))).toBe(false);
    const holed = [...Array.from({ length: 20 }, (_, i) => i * 100), ...Array.from({ length: 20 }, (_, i) => 1_900 + GAP_MS + 100 + i * 100)];
    expect(replayable(ep(holed))).toBe(false);
  });
  it("fills a gap at one point a second from candle closes", () => {
    const out = interpolateCandles([[0, 1, 1, 1, 100], [60_000, 1, 1, 1, 160]], 60_000, 120_000);
    expect(out[0]).toEqual([61_000, 101, null]);
    expect(out.length).toBe(59);
  });
});
