// Ported from Masayume 68f7a09:packages/core/src/games/arcade/field.ts
/**
 * The arcade's fixed world.
 *
 * Both engines simulate a 640×360 field at 60 steps a second, whatever the canvas that draws them
 * measures. That is what makes a run replayable: Pips's engines step on the frame's `dt` and read the
 * canvas's own width to decide how many line points or candles exist, so the same inputs on a phone and
 * a monitor produce different runs — and a server has no canvas at all. Here a run is a seed and a list
 * of inputs by tick, and the field they played on is this file.
 *
 * Nothing here calls `Math.sin`, `Math.exp` or `Math.pow`: those are not required to agree bit for bit
 * across JavaScript engines, and a score that replays to a different number on the server than in the
 * browser is a refused score. Every operation in the simulation is `+ − × ÷`, `min`, `max`, `abs`,
 * `floor` and `round`, which IEEE 754 fixes exactly.
 */
export const FIELD_W = 640;
export const FIELD_H = 360;
export const STEP_HZ = 60;
export const STEP_SEC = 1 / STEP_HZ;
export const STEP_MS = 1_000 / STEP_HZ;

/** The longest run the server will replay. A trace past this is refused, never accepted on its envelope alone. */
export const MAX_RUN_SEC = 30 * 60;
export const MAX_RUN_TICKS = MAX_RUN_SEC * STEP_HZ;

/** The ride's wheel is quantised to a byte before it enters the trace, so the trace is compact and the replay exact. */
export const TARGET_Q_MAX = 255;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export type ArcadeGame = "line-rider" | "candle-hop";

export const ARCADE_GAMES: readonly ArcadeGame[] = ["line-rider", "candle-hop"];

export function isArcadeGame(value: string): value is ArcadeGame {
  return value === "line-rider" || value === "candle-hop";
}

/**
 * The one option a run carries besides its seed. Reduced motion offers the calmer ramp — a slower
 * climb to full difficulty — and because the ramp is the mechanic, the replay has to know. It is
 * recorded with the score and the board says which runs took it.
 */
export interface ArcadeRunConfig {
  calm: boolean;
}

export function ticksToMs(ticks: number): number {
  return Math.round((ticks * 1_000) / STEP_HZ);
}

export function msToTicks(ms: number): number {
  return Math.round((ms * STEP_HZ) / 1_000);
}
