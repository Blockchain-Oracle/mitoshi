"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { installAudioUnlock, pressSfx, releaseSfx, stopBgm } from "./audio";
import { GamesProvider, useGames } from "./GamesProvider";
import { GamesRail } from "./GamesRail";
import "./games.css";

// The settings sheet is an island fetched on its first open (Base UI's dialog stays out of every /games first load).
const GameSettingsSheet = dynamic(() => import("./GameSettingsSheet").then((m) => m.GameSettingsSheet), { ssr: false, loading: () => null });

/**
 * The `/games` frame: settings, the rail, the active match and the accent, owned once for all
 * seven modes.
 *
 * Doc 06 calls this a "dark stage frame". It follows the theme instead, and that is a deliberate
 * divergence: the owner ruled on 2026-09-01 that the reel card must follow the theme after a dark
 * island rendered near-black ink on a near-black card in light mode. The one place a dark ground is
 * genuinely part of the mechanic is the arcade canvas, which paints its own surface in slice 4 and
 * will take `reel-theme.css`'s ink-triplet treatment rather than raw `var(--white)`.
 */
export function GamesShell({ children }: { children: ReactNode }) {
  return (
    <GamesProvider>
      <GamesFrame>{children}</GamesFrame>
    </GamesProvider>
  );
}

/** What sounds its press and release: every control under the frame, and the settings plate's, which portals out of it. */
const CONTROL = "button, a[href], [role='button'], [role='radio'], input[type='range']";
const SCOPE = ".gm-frame, .gm-settings-modal, .gm-howto";

function isControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SCOPE) !== null && target.closest(CONTROL) !== null;
}

function GamesFrame({ children }: { children: ReactNode }) {
  const { reducedMotion, settings, immersive, settingsOpen } = useGames();
  // Mounted from its first open on, so it can animate shut.
  const [settingsWanted, setSettingsWanted] = useState(false);
  if (settingsOpen && !settingsWanted) setSettingsWanted(true);

  // Audio lives for exactly as long as the frame does: unlocked on the first gesture and — Pips's discipline — every
  // control sounding its own press and release, baked in here once. The music bed is the stages' (R4-9, D-227: Senryo
  // starts it on Play and stops it at game over or exit); the hub plays only the press sounds.
  useEffect(() => {
    const uninstall = installAudioUnlock();
    const onDown = (event: PointerEvent) => {
      if (isControl(event.target)) pressSfx();
    };
    const onUp = (event: PointerEvent) => {
      if (isControl(event.target)) releaseSfx();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "Enter" || event.key === " ") && !event.repeat && isControl(event.target)) pressSfx();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if ((event.key === "Enter" || event.key === " ") && isControl(event.target)) releaseSfx();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      uninstall();
      stopBgm();
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    // `data-reduced-motion` is the single switch every stage animation reads. A stage must never
    // consult the media query itself: the player's explicit choice has to beat the OS, and it can
    // only do that if there is one place that resolves the two.
    <div className="gm-frame" data-reduced-motion={reducedMotion ? "true" : "false"} data-accent={settings.accent} data-immersive={immersive ? "" : undefined}>
      <GamesRail />
      {children}
      {settingsWanted ? <GameSettingsSheet /> : null}
    </div>
  );
}
