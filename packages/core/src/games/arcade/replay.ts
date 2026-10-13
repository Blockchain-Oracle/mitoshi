// Ported from Masayume 68f7a09:packages/core/src/games/arcade/replay.ts
import { MAX_RUN_TICKS, type ArcadeGame, type ArcadeRunConfig } from "./field";
import { createFlapState, stepFlap } from "./flap";
import { createRideState, RIDE_START_Q, rideScoreOf, stepRide } from "./ride";
import { createRng } from "./rng";
import { sledScoreOf, stepSled } from "./sled";
import { createSledState } from "./sled-world";
import type { FlapTrace, RideTrace } from "./trace";

/**
 * A run, played again from its seed and its inputs — the server's whole check.
 *
 * The browser records what it did; the server does the same thing with the same dice and looks at the
 * number. A run that ends where the browser said it ended, on the score the browser said, is a run
 * that happened. It does not prove the browser was not driven by a script — nothing in a browser can —
 * which is why the board says "server-checked" and no money ever rides on these scores.
 *
 * After the last recorded input the wheel holds and the button is silent, and the run plays out to its
 * end on its own: a line leaves a still pip, a flyer without a press falls. So a replay always finishes,
 * and one that is still running at the budget is refused rather than trusted.
 */
export interface ReplayResult {
  score: number;
  ticks: number;
  /** False when the run had not ended by the replay budget — never a score to accept. */
  ended: boolean;
}

export function replayRide(seed: string, trace: RideTrace, config: ArcadeRunConfig): ReplayResult {
  const rng = createRng(seed);
  const state = createRideState(rng, config);
  let cursor = 0;
  let targetQ = RIDE_START_Q;
  while (!state.over && state.tick < MAX_RUN_TICKS) {
    while (cursor < trace.length && (trace[cursor] as number) === state.tick) {
      targetQ = trace[cursor + 1] as number;
      cursor += 2;
    }
    stepRide(state, targetQ, rng, config);
  }
  return { score: rideScoreOf(state), ticks: state.tick, ended: state.over };
}

export function replayFlap(seed: string, trace: FlapTrace, config: ArcadeRunConfig): ReplayResult {
  const rng = createRng(seed);
  const state = createFlapState(rng, config);
  let cursor = 0;
  while (!state.over && state.tick < MAX_RUN_TICKS) {
    let flap = false;
    while (cursor < trace.length && (trace[cursor] as number) === state.tick) {
      flap = true;
      cursor += 1;
    }
    stepFlap(state, flap, rng, config);
  }
  return { score: state.score, ticks: state.tick, ended: state.over };
}

/** Line Rider v3, the sled (ported from Senryo `replayRide`, R4-9): the code holds from its tick until the next pair; it opens at 0. */
export function replaySled(seed: string, trace: RideTrace, config: ArcadeRunConfig): ReplayResult {
  const rng = createRng(seed);
  const state = createSledState(rng, config);
  let cursor = 0;
  let code = 0;
  while (!state.over && state.tick < MAX_RUN_TICKS) {
    while (cursor < trace.length && (trace[cursor] as number) === state.tick) {
      code = trace[cursor + 1] as number;
      cursor += 2;
    }
    stepSled(state, code, rng, config);
  }
  return { score: sledScoreOf(state), ticks: state.tick, ended: state.over };
}

/** The server's replay: Line Rider is the sled (v3); Candle Hop the flyer. */
export function replayArcade(game: ArcadeGame, seed: string, trace: readonly number[], config: ArcadeRunConfig): ReplayResult {
  return game === "line-rider" ? replaySled(seed, trace, config) : replayFlap(seed, trace, config);
}
