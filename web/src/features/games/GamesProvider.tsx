"use client";

import { activeMatchId as activeMatchIdOf, IDLE, type MatchState } from "@cwf/core/games";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";

const usePrefersReducedMotion = () => useReducedMotion() === true;
import { fireFeedback, type FeedbackCue } from "./feedback";
import {
  reducedMotionFrom,
  useGameSettingsStore,
  type AccentChoice,
  type GameSettings,
  type MotionChoice,
} from "./settings";

interface GamesContextValue {
  settings: GameSettings;
  hydrated: boolean;
  setHaptics: (on: boolean) => void;
  setMotion: (choice: MotionChoice) => void;
  setAccent: (accent: AccentChoice) => void;
  /** What the OS is asking for right now, so settings can say which way "Follow system" resolves. */
  systemPrefersReduced: boolean;
  /** The answer every stage should use: the explicit choice, or the OS when there is none. */
  reducedMotion: boolean;
  /** One call for a cue; it consults the settings so no caller has to remember to. */
  feedback: (cue: FeedbackCue) => void;
  /**
   * The match the shell believes is in flight.
   *
   * The layout owns this because the hub must restore an active match *before* it offers a fresh
   * queue (`06-game-architecture.md` §`/games`), and that is a property of the shell rather than of
   * whichever stage happens to be mounted. Today the only value is `IDLE`: no arena exists to
   * publish anything else, and inventing a match to fill the slot would be exactly the fabrication
   * the honesty rules forbid. Slice 8's stage publishes into `setMatch` from real arena events.
   */
  match: MatchState;
  setMatch: (state: MatchState) => void;
  activeMatchId: string | null;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  /**
   * A round or run is live (R4-9, D-227): the frame wears `data-immersive`, and on phones the shell hides its dock and
   * top line (app-shell.css), so the play surface owns the screen — as the terminal does with `:has()`.
   */
  immersive: boolean;
  setImmersive: (on: boolean) => void;
}

const GamesContext = createContext<GamesContextValue | null>(null);

export function GamesProvider({ children }: { children: ReactNode }) {
  const store = useGameSettingsStore();
  const systemPrefersReduced = usePrefersReducedMotion();
  const [match, setMatch] = useState<MatchState>(IDLE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [immersive, setImmersive] = useState(false);

  const { settings } = store;
  const reducedMotion = reducedMotionFrom(settings.motion, systemPrefersReduced);

  const feedback = useCallback(
    (cue: FeedbackCue) => fireFeedback(cue, { haptics: settings.haptics }),
    [settings.haptics],
  );

  const value = useMemo<GamesContextValue>(
    () => ({
      settings,
      hydrated: store.hydrated,
      setHaptics: store.setHaptics,
      setMotion: store.setMotion,
      setAccent: store.setAccent,
      systemPrefersReduced,
      reducedMotion,
      feedback,
      match,
      setMatch,
      activeMatchId: activeMatchIdOf(match),
      settingsOpen,
      setSettingsOpen,
      immersive,
      setImmersive,
    }),
    [settings, store.hydrated, store.setHaptics, store.setMotion, store.setAccent, systemPrefersReduced, reducedMotion, feedback, match, settingsOpen, immersive],
  );

  return <GamesContext.Provider value={value}>{children}</GamesContext.Provider>;
}

/** Throws outside `/games`, which is the point: a stage without the shell has no settings to obey. */
export function useGames(): GamesContextValue {
  const value = useContext(GamesContext);
  if (!value) throw new Error("useGames must be used inside the /games layout");
  return value;
}

/** A stage holds the frame immersive while `on` (a round dealt and not scored, a run playing); leaving releases it. */
export function useImmersive(on: boolean): void {
  const { setImmersive } = useGames();
  useEffect(() => {
    setImmersive(on);
    return () => setImmersive(false);
  }, [on, setImmersive]);
}
