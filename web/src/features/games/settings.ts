"use client";

import { booleanCodec, usePersistedState } from "@/lib/persisted";

/**
 * The three stage settings PIPS applies immediately (`reference/pips` menu/settings), in this
 * shell's own terms, plus the accent a player wears.
 *
 * Motion is deliberately three-state and not a boolean. `game_settings.reduced_motion` is a
 * nullable column for the same reason: absent means "follow the operating system", which is a
 * different answer from "the player asked for full motion". Collapsing the two would override an
 * accessibility preference the player never touched.
 */
export type MotionChoice = "system" | "full" | "reduced";

/**
 * Every accent is a colour the design system already has — signal (the sole brand accent) and
 * the venue's own two sides. `default` is no colour at all: it is the deterministic hue this app
 * already derives from an address, so a player who never opens settings still has an identity.
 */
export type AccentChoice = "default" | "signal" | "up" | "down";

export const ACCENT_CHOICES: readonly AccentChoice[] = ["default", "signal", "up", "down"];

export const ACCENT_LABELS: Readonly<Record<AccentChoice, string>> = {
  default: "Address",
  signal: "Signal",
  up: "Up",
  down: "Down",
};

export interface GameSettings {
  haptics: boolean;
  motion: MotionChoice;
  accent: AccentChoice;
}

const MOTION_KEY = "owarine.games.motion";
const HAPTICS_KEY = "owarine.games.haptics";
const ACCENT_KEY = "owarine.games.accent";

const motionCodec = {
  parse: (raw: string): MotionChoice | null => (raw === "system" || raw === "full" || raw === "reduced" ? raw : null),
  serialize: (value: MotionChoice) => value,
};

const accentCodec = {
  parse: (raw: string): AccentChoice | null => (ACCENT_CHOICES.includes(raw as AccentChoice) ? (raw as AccentChoice) : null),
  serialize: (value: AccentChoice) => value,
};

export interface GameSettingsStore {
  settings: GameSettings;
  setHaptics: (on: boolean) => void;
  setMotion: (choice: MotionChoice) => void;
  setAccent: (accent: AccentChoice) => void;
  /** False until localStorage has been read, so nothing renders a stored choice on the server. */
  hydrated: boolean;
}

/**
 * Three independent persisted values rather than one JSON blob: a corrupt key loses one setting. Sound
 * is not among them any more — it is two sliders, persisted by `audio.ts`, which is what Flicky ships.
 */
export function useGameSettingsStore(): GameSettingsStore {
  const [haptics, setHaptics, hapticsReady] = usePersistedState(HAPTICS_KEY, true, booleanCodec);
  const [motion, setMotion, motionReady] = usePersistedState<MotionChoice>(MOTION_KEY, "system", motionCodec);
  const [accent, setAccent, accentReady] = usePersistedState<AccentChoice>(ACCENT_KEY, "default", accentCodec);

  return {
    settings: { haptics, motion, accent },
    setHaptics,
    setMotion,
    setAccent,
    hydrated: hapticsReady && motionReady && accentReady,
  };
}

/** The player's explicit choice wins; `system` defers to the OS query the shell already watches. */
export function reducedMotionFrom(choice: MotionChoice, systemPrefersReduced: boolean): boolean {
  if (choice === "reduced") return true;
  if (choice === "full") return false;
  return systemPrefersReduced;
}
