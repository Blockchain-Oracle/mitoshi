// Ported from Masayume 68f7a09:packages/core/src/games/arcade/ride.ts
import { clamp, clamp01, FIELD_H, FIELD_W, lerp, STEP_SEC, TAPE_MIN_POINTS, tapeAt, TARGET_Q_MAX, type ArcadeRunConfig } from "./field";
import type { Rng } from "./rng";

/**
 * Line Rider's mechanics, as a pure step over a state.
 *
 * Pips's `rideEngine.ts`, re-expressed: a trend line scrolls in from the right and the player rides a
 * pip on it. Hug the line and the score climbs — faster the tighter the hug, through a combo multiplier —
 * and grip refills; drift off and the combo decays while grip drains; grip empty, run over. Speed and
 * the tolerance band ramp after a warm-up, and past the ramp the speed keeps creeping so every run
 * eventually breaks, which is what makes a high score worth chasing.
 *
 * What is different from the reference is what makes it checkable: the field is fixed (`field.ts`), the
 * step is fixed, every random draw comes from the seeded generator, and the only input is one byte a
 * tick — where the wheel is. Nothing visual lives here; trails, sparks and heat colour are the draw
 * module's, and they read this state rather than steer it.
 */
/** v2 (R4-9, D-227): the line rides a server-issued tape of real RedStone prints when one is given — its own board. */
export const RIDE_ENGINE_VERSION = 2;

interface RideTuning {
  warmupSec: number;
  rampSec: number;
  speed0: number;
  speed1: number;
  speedCreep: number;
  drain0: number;
  drain1: number;
  drainCreep: number;
}

const FULL: RideTuning = { warmupSec: 2, rampSec: 34, speed0: 95, speed1: 360, speedCreep: 6, drain0: 0.4, drain1: 1.5, drainCreep: 0.02 };
/** The calmer ramp: the same game, with the climb to full difficulty nearly twice as long and a gentler ceiling. */
const CALM: RideTuning = { warmupSec: 3, rampSec: 60, speed0: 90, speed1: 300, speedCreep: 4, drain0: 0.35, drain1: 1.1, drainCreep: 0.015 };

export const RIDE = {
  /** The pip sits here; the line flows in from the right, which is the future. */
  pipX: FIELD_W * 0.32,
  /** The line stays inside this vertical band, normalised to the field's height. */
  yMin: 0.16,
  yMax: 0.84,
  /** Wheel 0 puts the pip near the floor, wheel 1 near the ceiling — a touch past the line's own band. */
  pipLo: 0.92,
  pipHi: 0.08,
  /** Field units between generated line points. */
  segPx: 12,
  /** On-line tolerance, a half-band normalised to the height: generous early, tight late. */
  band0: 0.08,
  band1: 0.04,
  pipTrack: 16,
  baseRate: 34,
  multRamp: 0.55,
  multHug: 1.5,
  multDecay: 9,
  gripRefill: 0.26,
  graceSec: 0.12,
  /** Enough points to cover the field plus read-ahead off its right edge. */
  points: Math.ceil(FIELD_W / 12) + 4,
} as const;

export interface RideState {
  tick: number;
  elapsedSec: number;
  over: boolean;
  /** The wheel, 0..1, as last set. */
  target: number;
  pipY: number;
  pipYPrev: number;
  worldX: number;
  worldXPrev: number;
  /** World index of `pts[0]`; the line is a ring of normalised y values that scrolls left. */
  head: number;
  pts: number[];
  genCur: number;
  genGoal: number;
  segsToGoal: number;
  /** How far along the tape the line has read, in tape points (v2). */
  tapeAt: number;
  score: number;
  mult: number;
  grip: number;
  onLine: boolean;
  offForSec: number;
  onForSec: number;
  milestone: number;
  /** How far the ramp has run, 0..1, and the speed and band it gives — kept for the draw and the audio. */
  difficulty: number;
  speed: number;
  band: number;
  /** Events of the last step, cleared at the top of the next: the pip found the line again; the combo crossed a whole number. */
  regained: boolean;
  milestoneHit: number;
}

function tuning(config: ArcadeRunConfig): RideTuning {
  return config.calm ? CALM : FULL;
}

function difficultyOf(elapsedSec: number, t: RideTuning): number {
  return clamp01((elapsedSec - t.warmupSec) / t.rampSec);
}

/** Seconds past full difficulty — the endless escalation that eventually breaks a run. */
function overrunOf(elapsedSec: number, t: RideTuning): number {
  return Math.max(0, elapsedSec - t.warmupSec - t.rampSec);
}

/**
 * The next line point: ease toward a goal, reroll the goal periodically (more often and farther as
 * difficulty rises), with rare sharp spikes late so the line can jab. The generator is drawn in a fixed
 * order and only here, so a seed fixes the line and nothing else spends its draws.
 */
function nextY(state: RideState, rng: Rng, d: number, config: ArcadeRunConfig): number {
  const tape = config.tape;
  if (tape && tape.length >= TAPE_MIN_POINTS) {
    // The flat opening, then the real chart: high prices high on the field, read faster (and so steeper) as it ramps.
    if (state.segsToGoal > 0) {
      state.segsToGoal -= 1;
      return clamp(state.genCur, RIDE.yMin, RIDE.yMax);
    }
    state.tapeAt += lerp(0.35, 1.1, d);
    const goal = lerp(RIDE.yMax, RIDE.yMin, tapeAt(tape, state.tapeAt));
    state.genCur += (goal - state.genCur) * lerp(0.35, 0.6, d);
    return clamp(state.genCur, RIDE.yMin, RIDE.yMax);
  }
  if (state.segsToGoal <= 0) {
    const spike = d > 0.35 && rng.next() < 0.05 + d * 0.12;
    const span = lerp(0.16, 0.52, d) * (spike ? 1.7 : 1);
    const lo = Math.max(RIDE.yMin, state.genCur - span);
    const hi = Math.min(RIDE.yMax, state.genCur + span);
    state.genGoal = lo + rng.next() * (hi - lo);
    const base = lerp(16, 3.2, d);
    state.segsToGoal = Math.max(2, Math.round((spike ? base * 0.35 : base) * (0.6 + rng.next() * 0.8)));
  }
  state.segsToGoal -= 1;
  const ease = lerp(0.09, 0.3, d);
  state.genCur += (state.genGoal - state.genCur) * ease;
  return clamp(state.genCur, RIDE.yMin, RIDE.yMax);
}

function fill(state: RideState, rng: Rng, d: number, config: ArcadeRunConfig): void {
  while (state.pts.length < RIDE.points) state.pts.push(nextY(state, rng, d, config));
}

/**
 * The line's normalised y at a field x, interpolated between the two points around it. The draw passes
 * its own interpolated `worldX` so the line moves smoothly between steps; the simulation passes none.
 */
export function rideLineYAt(state: RideState, x: number, worldX = state.worldX): number {
  const worldPos = (worldX + x) / RIDE.segPx;
  const i = Math.floor(worldPos - state.head);
  const last = state.pts.length - 1;
  if (i < 0 || i >= last) return state.pts[clamp(i, 0, last)] ?? 0.5;
  const f = worldPos - state.head - i;
  return lerp(state.pts[i] as number, state.pts[i + 1] as number, f);
}

export function targetFromQ(targetQ: number): number {
  return clamp(targetQ, 0, TARGET_Q_MAX) / TARGET_Q_MAX;
}

export function qFromTarget(target: number): number {
  return Math.round(clamp01(target) * TARGET_Q_MAX);
}

/** Every run opens with the wheel centred, on the browser and on the server alike. */
export const RIDE_START_Q = Math.round(TARGET_Q_MAX / 2);

/**
 * A run at tick zero. The line opens dead flat where the pip sits, so the run always begins on the line
 * and never with a free death; it starts to move once the warm-up's flat stretch has scrolled through.
 */
export function createRideState(rng: Rng, config: ArcadeRunConfig): RideState {
  const t = tuning(config);
  const target = targetFromQ(RIDE_START_Q);
  const startY = clamp(lerp(RIDE.pipLo, RIDE.pipHi, target), RIDE.yMin, RIDE.yMax);
  const state: RideState = {
    tick: 0,
    elapsedSec: 0,
    over: false,
    target,
    pipY: startY,
    pipYPrev: startY,
    worldX: 0,
    worldXPrev: 0,
    head: 0,
    pts: [],
    genCur: startY,
    genGoal: startY,
    segsToGoal: 30,
    tapeAt: 0,
    score: 0,
    mult: 1,
    grip: 1,
    onLine: true,
    offForSec: 0,
    onForSec: 0,
    milestone: 1,
    difficulty: 0,
    speed: t.speed0,
    band: RIDE.band0,
    regained: false,
    milestoneHit: 0,
  };
  fill(state, rng, 0, config);
  return state;
}

/** One 60 Hz step with the wheel at `targetQ`. Mutates in place; a finished run ignores further steps. */
export function stepRide(state: RideState, targetQ: number, rng: Rng, config: ArcadeRunConfig): void {
  if (state.over) return;
  const t = tuning(config);
  const dt = STEP_SEC;
  state.regained = false;
  state.milestoneHit = 0;
  state.target = targetFromQ(targetQ);
  state.pipYPrev = state.pipY;
  state.worldXPrev = state.worldX;

  const d = difficultyOf(state.elapsedSec, t);
  state.elapsedSec += dt;
  state.tick += 1;
  state.difficulty = d;

  // Scroll the world; drop points that have left the left edge and generate to the right.
  const speed = lerp(t.speed0, t.speed1, d) + overrunOf(state.elapsedSec, t) * t.speedCreep;
  state.speed = speed;
  state.worldX += speed * dt;
  while ((state.head + 1) * RIDE.segPx < state.worldX) {
    state.pts.shift();
    state.head += 1;
  }
  fill(state, rng, d, config);

  // The pip eases toward the wheel.
  const targetY = lerp(RIDE.pipLo, RIDE.pipHi, state.target);
  state.pipY += (targetY - state.pipY) * Math.min(1, dt * RIDE.pipTrack);

  const lineY = rideLineYAt(state, RIDE.pipX);
  const band = lerp(RIDE.band0, RIDE.band1, d);
  state.band = band;
  const dist = Math.abs(state.pipY - lineY);
  const onLine = dist <= band;
  if (onLine && !state.onLine) state.regained = true;
  if (onLine) {
    state.onForSec += dt;
    state.offForSec = 0;
  } else {
    state.offForSec += dt;
    state.onForSec = 0;
  }
  state.onLine = onLine;

  if (onLine) {
    const hug = 1 - clamp01(dist / band);
    state.mult += dt * (RIDE.multRamp + RIDE.multHug * hug);
    state.score += dt * RIDE.baseRate * state.mult * (0.5 + 0.5 * hug);
    state.grip = Math.min(1, state.grip + dt * RIDE.gripRefill);
  } else {
    state.mult = Math.max(1, state.mult - dt * RIDE.multDecay);
    // No grip loss through the warm-up: the opening seconds are a free window to find the line.
    if (state.offForSec > RIDE.graceSec && state.elapsedSec > t.warmupSec) {
      state.grip -= dt * (lerp(t.drain0, t.drain1, d) + overrunOf(state.elapsedSec, t) * t.drainCreep);
    }
  }

  const whole = Math.floor(state.mult);
  if (whole > state.milestone) {
    state.milestone = whole;
    state.milestoneHit = whole;
  } else if (state.mult < state.milestone) {
    state.milestone = Math.max(1, Math.floor(state.mult));
  }

  if (state.grip <= 0) {
    state.grip = 0;
    state.over = true;
  }
}

/** The integer a run is scored as, on the HUD and on the board. */
export function rideScoreOf(state: RideState): number {
  return Math.round(state.score);
}
