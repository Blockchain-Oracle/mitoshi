"use client";

import { playSfx, type SfxName } from "./audio";

/**
 * One cue, two channels: the sample it plays (Flicky's set, `audio.ts`) and the buzz it gives.
 *
 * The three original cues stay as names so nothing that calls them has to change: `tap` is a buzz
 * only, because every control under `/games` already sounds its own press and release; `confirm` is
 * a buzz only, because the swipe that confirms has its own two sounds; `deny` is the refusal sample.
 * `crash` is the arcade's wipeout — a buzz only, because the arcade synthesizes its own sound for it.
 * The rest are Flicky's cue moments by name.
 */
export type FeedbackCue = "tap" | "confirm" | "deny" | "crash" | SfxName;

const SAMPLE: Readonly<Record<FeedbackCue, SfxName | null>> = {
  tap: null,
  confirm: null,
  deny: "card-loss",
  crash: null,
  "swipe-up": "swipe-up",
  "swipe-down": "swipe-down",
  "card-win": "card-win",
  "card-loss": "card-loss",
  "match-found": "match-found",
  "duel-win": "duel-win",
  "duel-lose": "duel-lose",
  click: "click",
  "modal-open": "modal-open",
  "modal-close": "modal-close",
};

/** Kept short: a game buzz that talks over a hand is a setting people turn off once. Zero is none. */
const VIBRATE_MS: Readonly<Record<FeedbackCue, number>> = {
  tap: 8,
  confirm: 18,
  deny: 36,
  crash: 60,
  "swipe-up": 18,
  "swipe-down": 18,
  "card-win": 24,
  "card-loss": 36,
  "match-found": 40,
  "duel-win": 60,
  "duel-lose": 60,
  click: 8,
  "modal-open": 0,
  "modal-close": 0,
};

/** Whether this device reports vibration at all — iOS Safari does not, and saying so is honest. */
export function hapticsSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function fireFeedback(cue: FeedbackCue, opts: { haptics: boolean }): void {
  const sample = SAMPLE[cue];
  if (sample) playSfx(sample);
  const ms = VIBRATE_MS[cue];
  if (ms > 0 && opts.haptics && hapticsSupported()) {
    try {
      navigator.vibrate(ms);
    } catch {
      // Best effort: a device that refuses is not an error the player needs to hear about.
    }
  }
}
