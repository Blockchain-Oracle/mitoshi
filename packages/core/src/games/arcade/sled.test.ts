// Line Rider v3, the sled (R4-9, D-227; ported from Senryo): a run recorded live replays to the same score and length
// on the same moves tape, a different tape lays a different line, and every run ends.
import { describe, expect, it } from "vitest";
import { MAX_RUN_TICKS, STEP_HZ, ticksToMs } from "./field";
import { replaySled } from "./replay";
import { createRng } from "./rng";
import { sledCode, sledScoreOf, stepSled } from "./sled";
import { createSledState } from "./sled-world";
import { envelopeCheck, recordSledInput, sledScoreCeiling } from "./trace";

const SEED = "5eed1234";
const MOVES = Array.from({ length: 120 }, (_, i) => Math.round(40 * Math.sin(i / 6)) + (i % 7) - 3);
const CONFIG = { calm: false, moves: MOVES };

function play(config: typeof CONFIG) {
  const rng = createRng(SEED);
  const s = createSledState(rng, config);
  const trace: number[] = [];
  while (!s.over && s.tick < MAX_RUN_TICKS) {
    // A steady player: charge for half a second, let go, now and then.
    const code = sledCode(s.tick % 90 < 30, 0);
    recordSledInput(trace, s.tick, code);
    stepSled(s, code, rng, config);
  }
  return { s, trace };
}

describe("the sled", () => {
  it("replays a recorded run to the same score and length, and the run ends", () => {
    const { s, trace } = play(CONFIG);
    expect(s.over).toBe(true);
    expect(replaySled(SEED, trace, CONFIG)).toEqual({ score: sledScoreOf(s), ticks: s.tick, ended: true });
    const verdict = envelopeCheck("line-rider", ticksToMs(s.tick), trace, sledScoreOf(s), true);
    expect(verdict.ok).toBe(true);
    expect(sledScoreOf(s)).toBeLessThanOrEqual(sledScoreCeiling(s.tick / STEP_HZ));
  });

  it("lays its line from the tape: another tape, another line", () => {
    const a = createSledState(createRng(SEED), CONFIG).pts;
    const b = createSledState(createRng(SEED), { calm: false, moves: MOVES.map((m) => -m) }).pts;
    expect(a).not.toEqual(b);
  });
});
