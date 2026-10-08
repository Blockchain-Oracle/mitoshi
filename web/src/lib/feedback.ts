"use client";
/**
 * Sound & Vibration (S22.6, D-189; Slush's Personalize setting, Tradash's Settings → Feedback): one setting per
 * device for the trade sounds, the haptics, the trade reactions and the music, and the shell's tap feedback. This file
 * is in every app route's first load, so it holds only the setting and a loader: the sound engine and the haptics
 * (`lib/sound/trade.ts`, `lib/haptics.ts`) are fetched when the browser is idle, before the first tap, so the tap that
 * unlocks audio is already heard. A sound never blocks or breaks an action.
 */
import { useSyncExternalStore } from "react";
import { onIdle } from "./idle";

export interface FeedbackSettings {
  sound: boolean;
  haptics: boolean;
  reactions: boolean;
  music: boolean;
}

const KEY = "cwf.feedback.v1";
/** Tradash's defaults: sounds, haptics and reactions on; music off until asked for. */
export const FEEDBACK_DEFAULTS: FeedbackSettings = { sound: true, haptics: true, reactions: true, music: false };

let settings: FeedbackSettings | null = null;
const listeners = new Set<() => void>();
type Engines = { sound: typeof import("./sound/trade"); haptics: typeof import("./haptics") };
let engines: Engines | null = null;
let loading: Promise<Engines> | null = null;

function read(): FeedbackSettings {
  if (settings) return settings;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<FeedbackSettings>;
    settings = { ...FEEDBACK_DEFAULTS, ...pickBooleans(raw) };
  } catch {
    settings = { ...FEEDBACK_DEFAULTS };
  }
  return settings;
}

function pickBooleans(raw: Partial<FeedbackSettings>): Partial<FeedbackSettings> {
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => k in FEEDBACK_DEFAULTS && typeof v === "boolean"));
}

/** Load the engines (idempotent) and apply the current setting to them. */
export function loadFeedback(): Promise<Engines> {
  loading ??= Promise.all([import("./sound/trade"), import("./haptics")]).then(([sound, haptics]) => {
    const s = read();
    sound.installTradeSounds(!s.sound);
    haptics.installHaptics(s.haptics);
    engines = { sound, haptics };
    return engines;
  });
  return loading;
}

/** Warm the engines while the browser is idle (the shell calls this once). */
export function preloadFeedback(): () => void {
  return onIdle(() => void loadFeedback());
}

export function setFeedback(patch: Partial<FeedbackSettings>): void {
  settings = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* the choice holds for this page */
  }
  engines?.sound.setTradeMuted(!settings.sound);
  engines?.haptics.setHapticsEnabled(settings.haptics);
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useFeedback(): FeedbackSettings {
  return useSyncExternalStore(subscribe, read, () => FEEDBACK_DEFAULTS);
}

/** A trade's sound and haptic together (the terminal's open, close, win); loads the engines first if they aren't yet. */
export function tradeFeedback(cue: import("./sound/trade").TradeCue, haptic: import("./haptics").HapticKind): void {
  void loadFeedback().then((e) => {
    e.sound.playTrade(cue);
    e.haptics.haptic(haptic);
  }).catch(() => undefined);
}

/** A close's sound by its outcome (win / loss) and the close haptic. */
export function closeFeedback(pnl: number): void {
  void loadFeedback().then((e) => {
    e.sound.playCloseOutcome(pnl);
    e.haptics.haptic("close");
  }).catch(() => undefined);
}

/** The shell's tap: Tradash's `tap` cue and an 8 ms haptic, when the setting allows; silent until the engines load. */
export function tapFeedback(): void {
  if (!engines) {
    void loadFeedback();
    return;
  }
  engines.sound.playTrade("tap");
  engines.haptics.haptic("tap");
}

/** The engines once loaded, for the terminal's cues (open, close, win, loss, combo, surge…). */
export function feedbackEngines(): Engines | null {
  return engines;
}
