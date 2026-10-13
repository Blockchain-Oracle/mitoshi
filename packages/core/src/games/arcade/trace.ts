// Ported from Masayume 68f7a09:packages/core/src/games/arcade/trace.ts
import { FIELD_W, MAX_RUN_TICKS, msToTicks, STEP_HZ, TARGET_Q_MAX, type ArcadeGame } from "./field";
import { FLAP, FLAP_MAX_SPEED } from "./flap";
import { RIDE } from "./ride";
import { HOP, HOP_MAX_SPEED } from "./hop";
import { SLED } from "./sled-world";

/**
 * What a run is, on the wire: the inputs, by tick.
 *
 * A ride trace is a flat list of `tick, targetQ` pairs — the wheel's byte at the ticks it changed, so a
 * player holding still costs nothing. A hop trace is the ticks that were pressed. Both are plain
 * integer arrays: a few hundred bytes for a typical run, and never more than the replay budget allows.
 *
 * The envelope is the cheap refusal before the replay: a score no run of that length could reach, a
 * trace that claims inputs after the run ended, a shape that is not a trace at all. It is a bound, not
 * a check — a score inside the envelope is still only accepted once the replay reproduces it.
 */
export type RideTrace = readonly number[];
export type FlapTrace = readonly number[];
export type ArcadeTrace = RideTrace | FlapTrace;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** `null` when the trace is well formed, otherwise the first thing wrong with it. */
export function validateRideTrace(trace: unknown): string | null {
  if (!Array.isArray(trace)) return "a ride trace is an array";
  if (trace.length % 2 !== 0) return "a ride trace is tick, target pairs";
  if (trace.length > MAX_RUN_TICKS * 2) return "the trace is longer than any run can be";
  let lastTick = -1;
  for (let i = 0; i < trace.length; i += 2) {
    const tick = trace[i];
    const q = trace[i + 1];
    if (!isInt(tick) || tick < 0) return "a tick is a non-negative integer";
    if (tick <= lastTick) return "ticks rise strictly";
    if (!isInt(q) || q < 0 || q > TARGET_Q_MAX) return `a target is an integer 0..${TARGET_Q_MAX}`;
    lastTick = tick;
  }
  return null;
}

export function validateFlapTrace(trace: unknown): string | null {
  if (!Array.isArray(trace)) return "a hop trace is an array";
  if (trace.length > MAX_RUN_TICKS) return "the trace is longer than any run can be";
  let lastTick = -1;
  for (const tick of trace) {
    if (!isInt(tick) || tick < 0) return "a tick is a non-negative integer";
    if (tick <= lastTick) return "ticks rise strictly";
    lastTick = tick;
  }
  return null;
}

export function validateTrace(game: ArcadeGame, trace: unknown): string | null {
  return game === "line-rider" ? validateRideTrace(trace) : validateFlapTrace(trace);
}

function lastTickOf(trace: ArcadeTrace, game: ArcadeGame): number {
  if (trace.length === 0) return -1;
  return game === "line-rider" ? (trace[trace.length - 2] as number) : (trace[trace.length - 1] as number);
}

/**
 * The most a ride can score in `sec` seconds, with every tick hugging dead centre: the multiplier grows
 * at most `multRamp + multHug` a second from 1, and the score at most `baseRate × mult` a second.
 * Integrated, that is `baseRate × (sec + gain × sec² / 2)`, rounded up with a step of slack.
 */
export function rideScoreCeiling(sec: number): number {
  const gain = RIDE.multRamp + RIDE.multHug;
  return Math.ceil(RIDE.baseRate * (sec + (gain * sec * sec) / 2)) + 1;
}

/** Field units from the first candle's spawn until its body has passed the flyer — no hop scores before then. */
const FIELD_RUNWAY = FIELD_W + FIELD_W * FLAP.leadFrac - FLAP.birdX + FLAP.bodyW / 2;

/** The most a hop can score in `sec` seconds: nothing on the runway, then one candle per spacing at the fastest speed. */
export function flapScoreCeiling(sec: number): number {
  const flying = sec - FIELD_RUNWAY / FLAP_MAX_SPEED;
  if (flying <= 0) return 0;
  return Math.ceil((flying * FLAP_MAX_SPEED) / FLAP.spacing1) + 1;
}

export type EnvelopeVerdict = { ok: true; ticks: number } | { ok: false; why: string };

/** The cheap refusal: shape, length, inputs after the end, and a score past what the clock allows. */
/** A sled flips at most this often (lean's turn rate bounds it); generous — the cheap refusal only (Senryo). */
const SLED_MAX_FLIPS_PER_SEC = 4;

/**
 * The most a sled run can score in `sec` seconds (ported from Senryo `rideScoreCeiling`, R4-9 v3): every second at the
 * speed cap paying distance, airtime and the most flips, times a combo that grows a step per counted flight at most.
 */
export function sledScoreCeiling(sec: number): number {
  const perSec = SLED.maxSpeed * SLED.distRate + SLED.airRate + SLED_MAX_FLIPS_PER_SEC * SLED.flipBonus;
  const comboGrowth = SLED.comboStep / SLED.flightMinSec;
  return Math.ceil(perSec * (sec + (comboGrowth * sec * sec) / 0.5)) + 1;
}

/** Field px from Candle Hop v3's first candle's spawn until its body has passed the coin (Senryo `FIELD_RUNWAY`). */
const HOP_RUNWAY = FIELD_W + FIELD_W * HOP.leadFrac - (HOP.coinX - HOP.hitR - HOP.bodyW / 2);

/** The most a v3 hop can score in `sec` seconds: nothing on the runway, then one candle per spacing at the top speed. */
export function hopScoreCeiling(sec: number): number {
  const flying = sec - HOP_RUNWAY / HOP_MAX_SPEED;
  if (flying <= 0) return 0;
  return Math.ceil((flying * HOP_MAX_SPEED) / HOP.spacing1) + 1;
}

/**
 * `v3`: the engines on Mitoshi's v3 boards — Line Rider's sled (`sledScoreCeiling`) and Candle Hop's canyon
 * (`hopScoreCeiling`) — rather than the v1 pip and flyer the recorded fixtures were made on.
 */
export function envelopeCheck(game: ArcadeGame, durationMs: number, trace: unknown, score: number, v3 = false): EnvelopeVerdict {
  const shape = validateTrace(game, trace);
  if (shape) return { ok: false, why: shape };
  if (!Number.isInteger(durationMs) || durationMs <= 0) return { ok: false, why: "a run has a positive length" };
  if (!Number.isInteger(score) || score < 0) return { ok: false, why: "a score is a non-negative integer" };
  const ticks = msToTicks(durationMs);
  if (ticks > MAX_RUN_TICKS) return { ok: false, why: "the run is longer than the replay budget" };
  if (lastTickOf(trace as ArcadeTrace, game) >= ticks) return { ok: false, why: "the trace has inputs after the run ended" };
  const sec = ticks / STEP_HZ;
  const ceiling = game === "line-rider" ? (v3 ? sledScoreCeiling(sec) : rideScoreCeiling(sec)) : v3 ? hopScoreCeiling(sec) : flapScoreCeiling(sec);
  if (score > ceiling) return { ok: false, why: "no run of that length can score that" };
  return { ok: true, ticks };
}

/** The exact bytes a trace is hashed over: its JSON, with no whitespace and nothing else. */
export function traceCanonical(trace: ArcadeTrace): string {
  return JSON.stringify(trace);
}

/** The recorder's one rule for the ride: a pair only when the byte changes, so a still wheel writes nothing. */
export function recordRideInput(trace: number[], tick: number, targetQ: number): void {
  const n = trace.length;
  if (n === 0 || trace[n - 1] !== targetQ) trace.push(tick, targetQ);
}

/** The sled's recorder (Senryo's rule): a pair only when the code changes, and it opens at 0, so holding writes nothing. */
export function recordSledInput(trace: number[], tick: number, code: number): void {
  const n = trace.length;
  const last = n === 0 ? 0 : trace[n - 1];
  if (last !== code) trace.push(tick, code);
}
