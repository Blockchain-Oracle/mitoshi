// Candle Hop v3, the canyon (R4-9, D-227; ported from Senryo): a recorded run replays to the same score and length on
// the same moves tape, the envelope accepts it, and a rising move lifts the gap.
import { describe, expect, it } from "vitest";
import { FIELD_H, MAX_RUN_TICKS, STEP_HZ, ticksToMs } from "./field";
import { createHopState, HOP, stepHop } from "./hop";
import { replayHop } from "./replay";
import { createRng } from "./rng";
import { envelopeCheck, hopScoreCeiling } from "./trace";

const SEED = "5eed1234";
const MOVES = Array.from({ length: 90 }, (_, i) => Math.round(25 * Math.sin(i / 4)));
const CONFIG = { calm: false, moves: MOVES };

describe("the canyon", () => {
  it("replays a recorded run to the same score and length, inside the envelope", () => {
    const rng = createRng(SEED);
    const s = createHopState(rng, CONFIG);
    const trace: number[] = [];
    while (!s.over && s.tick < MAX_RUN_TICKS) {
      // Kick when below the next gap's middle and falling — a steady player.
      const next = s.candles.find((c) => c.x + HOP.bodyW / 2 > HOP.coinX - HOP.hitR);
      const press = !s.dying && s.coinY > (next ? next.center : FIELD_H / 2) && s.vy > 0;
      if (press) trace.push(s.tick);
      stepHop(s, press, rng, CONFIG);
    }
    expect(s.over).toBe(true);
    expect(replayHop(SEED, trace, CONFIG)).toEqual({ score: s.score, ticks: s.tick, ended: true });
    expect(envelopeCheck("candle-hop", ticksToMs(s.tick), trace, s.score, true).ok).toBe(true);
    expect(s.score).toBeLessThanOrEqual(hopScoreCeiling(s.tick / STEP_HZ));
  });

  it("lifts the gap on a rising move", () => {
    const up = createHopState(createRng(SEED), { calm: false, moves: Array.from({ length: 30 }, () => 40) });
    const down = createHopState(createRng(SEED), { calm: false, moves: Array.from({ length: 30 }, () => -40) });
    expect(up.candles.at(-1)!.center).toBeLessThan(down.candles.at(-1)!.center);
    expect(up.candles.every((c) => c.up)).toBe(true);
  });
});
