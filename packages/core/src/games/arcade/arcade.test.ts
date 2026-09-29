// Ported from Masayume 68f7a09:packages/core/src/games/arcade/arcade.test.ts
import { describe, expect, it } from "vitest";
import { MAX_RUN_TICKS, STEP_HZ, ticksToMs } from "./field";
import { createFlapState, FLAP, stepFlap } from "./flap";
import { replayFlap, replayRide } from "./replay";
import { createRideState, qFromTarget, RIDE, RIDE_START_Q, rideLineYAt, rideScoreOf, stepRide } from "./ride";
import { createRng, isArcadeSeed, seedFromBytes, seedFromUint32, seedToUint32 } from "./rng";
import { envelopeCheck, flapScoreCeiling, recordRideInput, rideScoreCeiling, traceCanonical, validateFlapTrace, validateRideTrace } from "./trace";

const SEED = "5eed1234";
const FULL = { calm: false };
const CALM = { calm: true };

/**
 * The recorded fixtures. Both were produced by driving the engines with a seeded bot — the ride's
 * tracks the line with a wobble that grows until it wipes out, the hop's presses when it is below the
 * next gap and misses more as time goes on — and the numbers are what the HUD showed when each run
 * ended. A change to any constant in the engines moves them, which is the point.
 */
const RIDE_FIXTURE = { score: 40_806, ticks: 3_742 };
const FLAP_FIXTURE = {
  score: 12,
  ticks: 1_186,
  trace: [30, 58, 87, 117, 146, 176, 205, 235, 257, 287, 316, 346, 375, 404, 434, 463, 493, 522, 551, 581, 610, 640, 669, 698, 728, 757, 787, 816, 845, 875, 904, 934, 963, 992, 1022, 1051, 1080, 1110, 1139, 1167, 1173, 1180],
};

/** The ride bot, as a browser would record it: one byte a tick, a pair written only when it changes. */
function recordRideRun(seed: string, config = FULL): { trace: number[]; score: number; ticks: number } {
  const rng = createRng(seed);
  const state = createRideState(rng, config);
  const noise = createRng("0badf00d");
  const trace: number[] = [];
  let q = RIDE_START_Q;
  while (!state.over && state.tick < STEP_HZ * 120) {
    if (state.tick % 3 === 0) {
      const wantY = rideLineYAt(state, RIDE.pipX + 24) + (noise.next() - 0.5) * (0.02 + state.elapsedSec * 0.004);
      q = qFromTarget((wantY - RIDE.pipLo) / (RIDE.pipHi - RIDE.pipLo));
    }
    recordRideInput(trace, state.tick, q);
    stepRide(state, q, rng, config);
  }
  return { trace, score: rideScoreOf(state), ticks: state.tick };
}

describe("the seeded generator", () => {
  it("is the same sequence for the same seed and a different one for a different seed", () => {
    const a = createRng(SEED);
    const b = createRng(SEED);
    const c = createRng("5eed1235");
    const seqA = [a.next(), a.next(), a.next()];
    expect(seqA).toEqual([b.next(), b.next(), b.next()]);
    expect(seqA).not.toEqual([c.next(), c.next(), c.next()]);
    for (const v of seqA) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of seqA) expect(v).toBeLessThan(1);
  });

  it("round-trips a seed through its word and its bytes, and refuses the wrong shape", () => {
    expect(seedFromUint32(seedToUint32(SEED))).toBe(SEED);
    expect(seedFromBytes(new Uint8Array([0x5e, 0xed, 0x12, 0x34]))).toBe(SEED);
    expect(isArcadeSeed("5EED1234")).toBe(false);
    expect(isArcadeSeed("5eed123")).toBe(false);
    expect(() => seedToUint32("nope")).toThrow();
    // A zero seed is legal on the wire and still produces a sequence.
    expect(createRng("00000000").next()).toBeGreaterThan(0);
  });
});

describe("Line Rider", () => {
  it("replays the recorded fixture to the score its HUD showed", () => {
    const run = recordRideRun(SEED);
    expect(run.score).toBe(RIDE_FIXTURE.score);
    expect(run.ticks).toBe(RIDE_FIXTURE.ticks);
    expect(replayRide(SEED, run.trace, FULL)).toEqual({ score: RIDE_FIXTURE.score, ticks: RIDE_FIXTURE.ticks, ended: true });
  });

  it("gives the same score for the same seed and trace, and a different one for another seed", () => {
    const run = recordRideRun(SEED);
    expect(replayRide(SEED, run.trace, FULL)).toEqual(replayRide(SEED, run.trace, FULL));
    expect(replayRide("0000beef", run.trace, FULL).score).not.toBe(run.score);
  });

  it("scores a run on the calm ramp differently from the same inputs on the full one", () => {
    const run = recordRideRun(SEED);
    expect(replayRide(SEED, run.trace, CALM).score).not.toBe(run.score);
  });

  it("opens on the line, never with a free death, and a still wheel eventually wipes out", () => {
    const rng = createRng(SEED);
    const state = createRideState(rng, FULL);
    expect(state.onLine).toBe(true);
    expect(state.grip).toBe(1);
    const result = replayRide(SEED, [], FULL);
    expect(result.ended).toBe(true);
    expect(result.ticks).toBeGreaterThan(STEP_HZ * 2);
    expect(result.ticks).toBeLessThan(MAX_RUN_TICKS);
  });

  it("reports a whole-number milestone once as the combo crosses it", () => {
    const rng = createRng(SEED);
    const state = createRideState(rng, FULL);
    const hits: number[] = [];
    let q = RIDE_START_Q;
    while (!state.over && state.tick < STEP_HZ * 20) {
      q = qFromTarget((rideLineYAt(state, RIDE.pipX + 24) - RIDE.pipLo) / (RIDE.pipHi - RIDE.pipLo));
      stepRide(state, q, rng, FULL);
      if (state.milestoneHit) hits.push(state.milestoneHit);
    }
    expect(hits[0]).toBe(2);
    expect(new Set(hits).size).toBe(hits.length);
  });
});

describe("Candle Hop", () => {
  it("replays the recorded fixture to the score its HUD showed", () => {
    expect(replayFlap(SEED, FLAP_FIXTURE.trace, FULL)).toEqual({ score: FLAP_FIXTURE.score, ticks: FLAP_FIXTURE.ticks, ended: true });
  });

  it("is deterministic per seed and sensitive to the seed", () => {
    expect(replayFlap(SEED, FLAP_FIXTURE.trace, FULL)).toEqual(replayFlap(SEED, FLAP_FIXTURE.trace, FULL));
    expect(replayFlap("0000beef", FLAP_FIXTURE.trace, FULL).score).not.toBe(FLAP_FIXTURE.score);
  });

  it("falls to the floor and ends with no score when nothing is pressed", () => {
    const result = replayFlap(SEED, [], FULL);
    expect(result).toMatchObject({ score: 0, ended: true });
    expect(result.ticks).toBeLessThan(STEP_HZ * 3);
  });

  it("bonks the ceiling without dying and scores a candle only once its body has passed", () => {
    const rng = createRng(SEED);
    const state = createFlapState(rng, FULL);
    for (let i = 0; i < 40; i += 1) stepFlap(state, true, rng, FULL);
    expect(state.dying).toBe(false);
    expect(state.birdY).toBeCloseTo(FLAP.hitY / 360, 5);
    expect(state.score).toBe(0);
  });
});

describe("the envelope", () => {
  it("accepts the fixtures as their own claims", () => {
    const ride = recordRideRun(SEED);
    expect(envelopeCheck("line-rider", ticksToMs(ride.ticks), ride.trace, ride.score)).toEqual({ ok: true, ticks: ride.ticks });
    expect(envelopeCheck("candle-hop", ticksToMs(FLAP_FIXTURE.ticks), FLAP_FIXTURE.trace, FLAP_FIXTURE.score)).toEqual({ ok: true, ticks: FLAP_FIXTURE.ticks });
  });

  it("refuses a score no run of that length can reach", () => {
    expect(rideScoreCeiling(10)).toBeGreaterThan(0);
    expect(envelopeCheck("line-rider", 10_000, [0, 128], rideScoreCeiling(10) + 1).ok).toBe(false);
    expect(envelopeCheck("candle-hop", 20_000, [], flapScoreCeiling(20) + 1).ok).toBe(false);
    // A hop cannot score before the first candle has crossed the flyer.
    expect(envelopeCheck("candle-hop", 1_000, [], 1).ok).toBe(false);
  });

  it("refuses inputs after the end, a run past the budget, and a malformed trace", () => {
    expect(envelopeCheck("line-rider", 1_000, [0, 128, 60, 100], 10).ok).toBe(false);
    expect(envelopeCheck("candle-hop", 1_000, [59], 0).ok).toBe(true);
    expect(envelopeCheck("candle-hop", 1_000, [60], 0).ok).toBe(false);
    expect(envelopeCheck("line-rider", ticksToMs(MAX_RUN_TICKS + 1), [], 1).ok).toBe(false);
    expect(validateRideTrace([0, 128, 0, 129])).not.toBeNull();
    expect(validateRideTrace([0, 256])).not.toBeNull();
    expect(validateRideTrace([0])).not.toBeNull();
    expect(validateRideTrace([0, 1.5])).not.toBeNull();
    expect(validateFlapTrace([3, 3])).not.toBeNull();
    expect(validateFlapTrace([-1])).not.toBeNull();
    expect(validateFlapTrace("no" as unknown)).not.toBeNull();
    expect(envelopeCheck("line-rider", -5, [], 0).ok).toBe(false);
    expect(envelopeCheck("line-rider", 1_000, [], -1).ok).toBe(false);
  });

  it("hashes a trace over its bare JSON, and the recorder writes a pair only on a change", () => {
    expect(traceCanonical([0, 128, 7, 130])).toBe("[0,128,7,130]");
    const trace: number[] = [];
    recordRideInput(trace, 0, 128);
    recordRideInput(trace, 1, 128);
    recordRideInput(trace, 2, 131);
    expect(trace).toEqual([0, 128, 2, 131]);
  });

  it("refuses a tampered claim at the replay: the same trace cannot carry a higher score", () => {
    const ride = recordRideRun(SEED);
    const claimed = ride.score + 500;
    expect(envelopeCheck("line-rider", ticksToMs(ride.ticks), ride.trace, claimed).ok).toBe(true);
    expect(replayRide(SEED, ride.trace, FULL).score).not.toBe(claimed);
  });
});
