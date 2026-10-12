"use client";

import { ChevronLeft, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { gameEntry, gameIdFromPath } from "./catalog";
import { GAMES } from "./copy";
import { useGames } from "./GamesProvider";
import { HowToSheet } from "./HowToSheet";
import { rememberGame } from "./last-game";

/**
 * The one strip every game surface carries.
 *
 * Doc 06 requires the same four things of every live stage: a way back to Games, the mode's
 * economic label, reach to the sound/haptics/motion controls, and the active match. Putting them
 * in the layout rather than in each stage is what makes that a guarantee instead of a convention —
 * a mode added later cannot forget to say whose money is at risk.
 */
export function GamesRail() {
  const pathname = usePathname();
  const id = gameIdFromPath(pathname);
  const entry = id ? gameEntry(id) : null;
  const { activeMatchId, setSettingsOpen, feedback, match } = useGames();
  const [howTo, setHowTo] = useState(false);
  // Pips remembers the last game opened; the hub offers it first.
  useEffect(() => rememberGame(pathname), [pathname]);

  // The swipe screens take the rail's height: the card needs it, and tabbing away mid-swipe with a real
  // stake in play is never wanted — the stage's own way out is the way out (Flicky layout.tsx L91–93).
  if (match.phase === "picking" || pathname === "/games/practice") return null;

  return (
    <>
    {entry && <HowToSheet id={entry.id} open={howTo} onClose={() => setHowTo(false)} />}
    <div className="gm-rail">
      <div className="container gm-rail-inner">
        {entry ? (
          <Link href="/games" className="gm-rail-back">
            <ChevronLeft aria-hidden className="gm-rail-chevron" />
            <span>{GAMES.rail.back}</span>
          </Link>
        ) : (
          <span className="gm-rail-here">{GAMES.rail.back}</span>
        )}

        {entry && (
          <>
            <span className="gm-rail-sep" aria-hidden />
            <span className="gm-rail-mode">{entry.nav.name}</span>
            <span className={`gm-econ gm-econ--${entry.descriptor.economicKind}`}>{entry.descriptor.economicLabel}</span>
          </>
        )}

        <div className="gm-rail-right">
          {entry && (
            <button type="button" className="gm-rail-howto" onClick={() => setHowTo(true)} aria-label={GAMES.howToWords.open} title={GAMES.howToWords.open}>
              ?
            </button>
          )}
          {activeMatchId && (
            <Link href="/games/duel" className="gm-rail-resume" title={GAMES.rail.resumeHint}>
              <span className="gm-rail-resume-dot" aria-hidden />
              {GAMES.rail.resume}
            </Link>
          )}
          <button
            type="button"
            className="gm-rail-settings"
            aria-label={GAMES.rail.settings}
            onClick={() => {
              feedback("tap");
              setSettingsOpen(true);
            }}
          >
            <SlidersHorizontal aria-hidden className="gm-rail-chevron" />
            <span className="gm-rail-settings-label">{GAMES.rail.settings}</span>
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
