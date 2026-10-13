import { seedFromBytes, type ArcadeGame } from "@cwf/core/games/arcade";

/**
 * What the stage hands a canvas, and what the canvas hands back.
 *
 * A run is a seed and the calm flag; `id` lets the same seed be played again. What comes back is the
 * whole claim the score API will check: the seed, the flag, the score the HUD showed, how long the run
 * was in ticks and milliseconds, and the trace of every input by tick.
 */
export interface ArcadeRun {
  id: number;
  seed: string;
  calm: boolean;
  /** Engine v2: the real-price tape the server issued with the seed (R4-9, D-227); absent, the seed draws the line. */
  tape?: readonly number[];
  /** Line Rider v3's sled terrain: the same prints as moves (tenths of a bp), and what they are of for the floor. */
  moves?: readonly number[];
  tapeMeta?: { feed: string; fromSec: number; toSec: number };
}

export interface RunEnd {
  game: ArcadeGame;
  seed: string;
  calm: boolean;
  score: number;
  ticks: number;
  durationMs: number;
  trace: number[];
}

export type ArcadePhase = "title" | "playing" | "over";

/** A seed from the browser's own entropy — for the idle picture and for play that posts nothing. */
export function localSeed(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return seedFromBytes(bytes);
}

