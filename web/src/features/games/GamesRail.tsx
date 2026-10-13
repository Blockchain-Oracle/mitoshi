"use client";

import { ChevronLeft, CircleHelp, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sticker } from "@/components/kit";
import { toggleMute, useMuted } from "./audio";
import { gameEntry, gameIdFromPath } from "./catalog";
import { GAMES } from "./copy";
import { useGames } from "./GamesProvider";
import { HowToSheet } from "./HowToSheet";
import { rememberGame } from "./last-game";

/** The cabinet sticker's tone by whose money is at risk: free reads profit, your stake the accent, the house's quiet. */
export const ECON_TONE = { none: "profit", "market-order": "accent", "market-order-and-pot": "accent", "house-position": "surface" } as const;

/**
 * The one strip every game stage carries (R4-9, D-227: one 44 px row, never null on a stage — Practice had no way
 * back, no how-to and no sound). Back, the mode's name and its econ sticker, then ?, sound and settings. The hub has no
 * rail: its own head carries the title and the settings (bug 7, the title said twice).
 */
export function GamesRail() {
  const pathname = usePathname();
  const id = gameIdFromPath(pathname);
  const entry = id ? gameEntry(id) : null;
  const { setSettingsOpen, feedback, activeMatchId } = useGames();
  const [howTo, setHowTo] = useState(false);
  const muted = useMuted();
  // Pips remembers the last game opened; the hub offers it first.
  useEffect(() => rememberGame(pathname), [pathname]);
  if (!entry) return null;

  return (
    <>
      <HowToSheet id={entry.id} open={howTo} onClose={() => setHowTo(false)} />
      <div className="gm-rail">
        <div className="gm-rail-inner">
          <Link href="/games" className="gm-rail-icon" aria-label={GAMES.rail.back} title={GAMES.rail.back}>
            <ChevronLeft aria-hidden />
          </Link>
          <span className="gm-rail-mode">{entry.nav.name}</span>
          <Sticker tone={ECON_TONE[entry.descriptor.economicKind]} size="sm" tilt={-3} className="gm-rail-econ" title={entry.descriptor.economicLabel}>
            {GAMES.econ[entry.descriptor.economicKind]}
          </Sticker>
          <div className="gm-rail-right">
            {activeMatchId ? (
              <Link href="/games/duel" className="gm-rail-resume">
                <span className="gm-rail-resume-dot" aria-hidden />
                {GAMES.rail.resume}
              </Link>
            ) : null}
            <button type="button" className="gm-rail-icon" onClick={() => setHowTo(true)} aria-label={GAMES.howToWords.open} title={GAMES.howToWords.open}>
              <CircleHelp aria-hidden />
            </button>
            <button type="button" className="gm-rail-icon" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? GAMES.rail.sound : GAMES.rail.mute} title={muted ? GAMES.rail.sound : GAMES.rail.mute}>
              {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
            </button>
            <SettingsButton onOpen={() => { feedback("tap"); setSettingsOpen(true); }} />
          </div>
        </div>
      </div>
    </>
  );
}

export function SettingsButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="gm-rail-icon" aria-label={GAMES.rail.settings} title={GAMES.rail.settings} onClick={onOpen}>
      <SlidersHorizontal aria-hidden />
    </button>
  );
}
