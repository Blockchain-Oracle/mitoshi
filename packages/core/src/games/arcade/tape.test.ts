// Engine v2's tape (R4-9, D-227): the terrain a server-issued price tape draws is the terrain the replay plays.
import { describe, expect, it } from "vitest";
import { MAX_RUN_TICKS, TAPE_Q, tapeAt } from "./field";
import { createFlapState, stepFlap } from "./flap";
import { replayFlap, replayRide } from "./replay";
import { createRideState, qFromTarget, RIDE, RIDE_START_Q, rideLineYAt, rideScoreOf, stepRide } from "./ride";
import { createRng } from "./rng";

const SEED = "5eed1234";
const RISING = Array.from({ length: 60 }, (_, i) => Math.round((i / 59) * TAPE_Q));
const TAPE = { calm: false, tape: RISING };

describe("the tape", () => {
  it("reads forward then back, from the low to the high", () => {
    expect(tapeAt(RISING, 0)).toBe(0);
    expect(tapeAt(RISING, 59)).toBe(1);
    expect(tapeAt(RISING, 118)).toBe(0);
    expect(tapeAt(RISING, 29.5)).toBeCloseTo(0.5, 2);
  });

  it("puts a rising chart's line higher on the field as the ride reads it", () => {
    // Ride it with the wheel on the line, so the run lives while the chart climbs.
    const state = createRideState(createRng(SEED), TAPE);
    const rng = createRng(SEED);
    const follow = () => qFromTarget((RIDE.pipLo - rideLineYAt(state, RIDE.pipX)) / (RIDE.pipLo - RIDE.pipHi));
    for (let i = 0; i < 150; i++) stepRide(state, follow(), rng, TAPE);
    const early = state.pts.at(-1)!;
    for (let i = 0; i < 150; i++) stepRide(state, follow(), rng, TAPE);
    expect(state.over).toBe(false);
    expect(state.pts.at(-1)!).toBeLessThan(early);
    expect(Math.min(...state.pts)).toBeGreaterThanOrEqual(RIDE.yMin);
  });

  it("replays a taped ride and hop to the same score as the live run, and differently from no tape", () => {
    const live = createRideState(createRng(SEED), TAPE);
    const rng = createRng(SEED);
    while (!live.over && live.tick < MAX_RUN_TICKS) stepRide(live, RIDE_START_Q, rng, TAPE);
    expect(replayRide(SEED, [], TAPE)).toEqual({ score: rideScoreOf(live), ticks: live.tick, ended: true });

    const hop = createFlapState(createRng(SEED), TAPE);
    const hopRng = createRng(SEED);
    const trace: number[] = [];
    while (!hop.over && hop.tick < MAX_RUN_TICKS) {
      const press = hop.tick % 24 === 0;
      if (press) trace.push(hop.tick);
      stepFlap(hop, press, hopRng, TAPE);
    }
    expect(replayFlap(SEED, trace, TAPE)).toEqual({ score: hop.score, ticks: hop.tick, ended: true });
    expect(createFlapState(createRng(SEED), TAPE).candles.map((c) => c.center)).not.toEqual(createFlapState(createRng(SEED), { calm: false }).candles.map((c) => c.center));
  });
});
