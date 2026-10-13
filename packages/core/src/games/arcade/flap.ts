// Ported from Masayume 68f7a09:packages/core/src/games/arcade/flap.ts
import { clamp01, FIELD_H, FIELD_W, lerp, STEP_SEC, TAPE_MIN_POINTS, tapeAt, type ArcadeRunConfig } from "./field";
import type { Rng } from "./rng";

/**
 * Candle Hop's mechanics, as a pure step over a state.
 *
 * Pips's `flapEngine.ts`, re-expressed: a one-button flight through the gaps between candlesticks that
 * scroll right to left. A press is a kick upward, gravity pulls back down; a candle whose body has
 * passed the flyer is a point; a candle, the floor — but not the ceiling, which only bonks — ends the
 * run after a short fall. Gap and spacing tighten over a ramp.
 *
 * As with the ride, the field and step are fixed, the candles come from the seeded generator, and the
 * input is one bit a tick. The flyer's tilt, its trail, the shake and the impact flash are visual and
 * live with the draw; the fall itself is here, because the run's length is part of what is checked.
 */
/** v2 (R4-9, D-227): the gaps follow a server-issued tape of real RedStone prints when one is given — its own board. */
export const FLAP_ENGINE_VERSION = 2;

interface FlapTuning {
  rampSec: number;
  speed0: number;
  speed1: number;
  gap1: number;
}

const FULL: FlapTuning = { rampSec: 48, speed0: 138, speed1: 172, gap1: 0.145 };
/** The fastest the field ever moves, in either tuning — the envelope's bound on candles per second. */
export const FLAP_MAX_SPEED = FULL.speed1;
/** The calmer ramp: a slower field and a gap that never closes as far. */
const CALM: FlapTuning = { rampSec: 80, speed0: 120, speed1: 150, gap1: 0.165 };

export const FLAP = {
  /** The flyer sits here; candles flow in from the right. */
  birdX: FIELD_W * 0.28,
  /** The flyer's drawn size in field units, and the forgiving hitbox inside it. */
  birdH: 46,
  birdW: 32,
  hitX: 11,
  hitY: 16.5,
  /** Normalised-height units per second squared, and the kick every press gives. */
  gravity: 5.6,
  flapV: -1.42,
  vyMax: 2.65,
  spacing0: 190,
  spacing1: 165,
  bodyW: 30,
  /** How far a wick pokes into the gap. */
  wick: 15,
  /** Half-gap, normalised, early; the late value is the tuning's. */
  gap0: 0.205,
  /** Both candles stay present: the gap's centre keeps this far inside its own half. */
  gapEdge: 0.06,
  /** The most the gap's centre may move between consecutive candles. */
  gapStep: 0.28,
  /** A short runway before the first candle. */
  leadFrac: 0.12,
  deathGravity: 7.2,
  deathVyMax: 3.2,
  deathMinSec: 0.5,
  deathMaxSec: 0.9,
  startY: 0.42,
} as const;

export interface Candle {
  /** Centre x in field units; scrolls left. */
  x: number;
  /** The gap's centre and half-height, both normalised to the field's height. */
  center: number;
  half: number;
  scored: boolean;
}

export interface FlapImpact {
  x: number;
  y: number;
  /** A candle hit is a full impact, the floor a softer one — the draw's shake and flash scale with it. */
  strength: number;
}

export interface FlapState {
  tick: number;
  elapsedSec: number;
  over: boolean;
  dying: boolean;
  deathElapsedSec: number;
  birdY: number;
  birdYPrev: number;
  vy: number;
  birdOffsetX: number;
  birdOffsetXPrev: number;
  worldX: number;
  worldXPrev: number;
  score: number;
  candles: Candle[];
  spawnX: number;
  lastCenter: number;
  /** Tape points read so far (v2). */
  tapeIdx: number;
  difficulty: number;
  speed: number;
  /** Events of the last step, cleared at the top of the next. */
  scored: boolean;
  crashed: boolean;
  impact: FlapImpact | null;
}

function tuning(config: ArcadeRunConfig): FlapTuning {
  return config.calm ? CALM : FULL;
}

function spacingOf(d: number): number {
  return lerp(FLAP.spacing0, FLAP.spacing1, d);
}

/** The next gap's centre: near the last one, so the run reads, and clamped so both candles stay on screen. */
function nextCenter(state: FlapState, rng: Rng, half: number, config: ArcadeRunConfig): number {
  const lo = half + FLAP.gapEdge;
  const hi = 1 - half - FLAP.gapEdge;
  const tape = config.tape;
  if (tape && tape.length >= TAPE_MIN_POINTS) {
    // The canyon is the real chart: a high print opens the gap high; the step between candles stays readable.
    state.tapeIdx += 1;
    const goal = lerp(hi, lo, tapeAt(tape, state.tapeIdx));
    const c = Math.max(lo, Math.min(hi, Math.max(state.lastCenter - FLAP.gapStep, Math.min(state.lastCenter + FLAP.gapStep, goal))));
    state.lastCenter = c;
    return c;
  }
  let c = state.lastCenter + (rng.next() * 2 - 1) * FLAP.gapStep;
  c = Math.max(lo, Math.min(hi, c));
  state.lastCenter = c;
  return c;
}

/** Keep candles queued out to just past the right edge. */
function fill(state: FlapState, rng: Rng, d: number, t: FlapTuning, config: ArcadeRunConfig): void {
  const half = lerp(FLAP.gap0, t.gap1, d);
  while (state.spawnX < FIELD_W + spacingOf(d)) {
    state.candles.push({ x: state.spawnX, center: nextCenter(state, rng, half, config), half, scored: false });
    state.spawnX += spacingOf(d);
  }
}

/** A run at tick zero. Pressing PLAY is also the first flap, so the run answers the first press. */
export function createFlapState(rng: Rng, config: ArcadeRunConfig): FlapState {
  const state: FlapState = {
    tick: 0,
    elapsedSec: 0,
    over: false,
    dying: false,
    deathElapsedSec: 0,
    birdY: FLAP.startY,
    birdYPrev: FLAP.startY,
    vy: FLAP.flapV,
    birdOffsetX: 0,
    birdOffsetXPrev: 0,
    worldX: 0,
    worldXPrev: 0,
    score: 0,
    candles: [],
    spawnX: FIELD_W + FIELD_W * FLAP.leadFrac,
    lastCenter: FLAP.startY,
    tapeIdx: 0,
    difficulty: 0,
    speed: tuning(config).speed0,
    scored: false,
    crashed: false,
    impact: null,
  };
  fill(state, rng, 0, tuning(config), config);
  return state;
}

function beginDeath(state: FlapState, x: number, y: number, strength: number): void {
  state.dying = true;
  state.deathElapsedSec = 0;
  state.impact = { x, y, strength };
  state.crashed = true;
  state.birdOffsetX = 0;
  state.vy = -0.18;
}

function stepDeath(state: FlapState): void {
  const dt = STEP_SEC;
  state.deathElapsedSec += dt;
  state.vy = Math.min(FLAP.deathVyMax, state.vy + FLAP.deathGravity * dt);
  state.birdY += state.vy * dt;
  state.birdOffsetX -= Math.max(0, 52 * (1 - state.deathElapsedSec / 0.48)) * dt;
  const fallenOut = state.birdY * FIELD_H - FLAP.birdH / 2 > FIELD_H;
  if ((state.deathElapsedSec >= FLAP.deathMinSec && fallenOut) || state.deathElapsedSec >= FLAP.deathMaxSec) {
    state.over = true;
    state.dying = false;
  }
}

/** One 60 Hz step, with or without a press. Mutates in place; a finished run ignores further steps. */
export function stepFlap(state: FlapState, flap: boolean, rng: Rng, config: ArcadeRunConfig): void {
  if (state.over) return;
  const t = tuning(config);
  const dt = STEP_SEC;
  state.scored = false;
  state.crashed = false;
  state.birdYPrev = state.birdY;
  state.birdOffsetXPrev = state.birdOffsetX;
  state.worldXPrev = state.worldX;
  state.tick += 1;

  if (state.dying) {
    stepDeath(state);
    return;
  }

  if (flap) state.vy = FLAP.flapV;

  state.elapsedSec += dt;
  const d = clamp01(state.elapsedSec / t.rampSec);
  state.difficulty = d;
  const speed = lerp(t.speed0, t.speed1, d);
  state.speed = speed;

  state.vy = Math.min(FLAP.vyMax, state.vy + FLAP.gravity * dt);
  state.birdY += state.vy * dt;
  state.worldX += speed * dt;

  state.spawnX -= speed * dt;
  for (const c of state.candles) c.x -= speed * dt;
  while (state.candles.length > 0 && (state.candles[0] as Candle).x < -FLAP.bodyW) state.candles.shift();
  fill(state, rng, d, t, config);

  // A candle whose body has fully passed the flyer is a point.
  for (const c of state.candles) {
    if (!c.scored && c.x + FLAP.bodyW / 2 < FLAP.birdX) {
      c.scored = true;
      state.score += 1;
      state.scored = true;
    }
  }

  // The ceiling clamps — a forgiving bonk; the floor and the candles are fatal.
  const hitYNorm = FLAP.hitY / FIELD_H;
  if (state.birdY < hitYNorm) {
    state.birdY = hitYNorm;
    state.vy = 0;
  }
  if (state.birdY > 1 - hitYNorm) {
    beginDeath(state, FLAP.birdX, FIELD_H - 1, 0.72);
    return;
  }
  const reach = FLAP.bodyW / 2 + FLAP.hitX;
  for (const c of state.candles) {
    if (Math.abs(c.x - FLAP.birdX) > reach) continue;
    const top = c.center - c.half;
    const bottom = c.center + c.half;
    const hitTop = state.birdY - hitYNorm < top;
    const hitBottom = state.birdY + hitYNorm > bottom;
    if (hitTop || hitBottom) {
      beginDeath(state, c.x - FLAP.bodyW / 2, (hitTop ? top : bottom) * FIELD_H, 1);
      return;
    }
  }
}
