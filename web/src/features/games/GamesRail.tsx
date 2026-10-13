"use client";

import { ChevronLeft, CircleHelp, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sticker } from "@/components/kit/Sticker";
import { toggleMute, useMuted } from "./audio";
import { gameEntry, gameIdFromPath } from "./catalog";
import { GAMES } from "./copy";
import { useGames } from "./GamesProvider";
import { rememberGame } from "./last-game";
import "@/components/kit/kit.css";

// The how-to is an island fetched on its first open, so the rail carries no dialog runtime into first load.
const HowToSheet = dynamic(() => import("./HowToSheet").then((m) => m.HowToSheet), { ssr: false, loading: () => null });

/** The cabinet sticker's tone by whose money is at risk: free reads profit, your stake the accent, the house's quiet. */
export const ECON_TONE = { none: "profit", "market-order": "accent", "market-order-and-pot": "accent", "house-position": "surface" } as const;

/**
 * The one strip every game stage carries (R4-9, D-227: one 44 px row, never null on a stage — Practice had no way
 * back, no how-to and no sound). Back, the mode's name and its econ sticker, then ?, sound and settings. The hub has no
 * rail: its own head carries the title and the settings (bug 7, the title said twice).
 */
/** The duel this wallet is paired into and still live, read once per route (no query client on the shell). */
function useLiveDuel(pathname: string | null): string | null {
  const [matchId, setMatchId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/games/duel/queue", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((w: { status?: string; matchId?: string } | null) => alive && setMatchId(w?.status === "paired" ? (w.matchId ?? null) : null))
      .catch(() => alive && setMatchId(null));
    return () => {
      alive = false;
    };
  }, [pathname]);
  return matchId;
}

export function GamesRail() {
  const pathname = usePathname();
  const id = gameIdFromPath(pathname);
  const entry = id ? gameEntry(id) : null;
  const { setSettingsOpen, feedback, activeMatchId: roomMatchId } = useGames();
  const [howTo, setHowTo] = useState(false);
  const [howToWanted, setHowToWanted] = useState(false);
  const liveDuel = useLiveDuel(pathname);
  // Resume shows off the duel's own stage: a live duel you're paired into, one tap back.
  const activeMatchId = pathname?.startsWith("/games/duel") ? null : (roomMatchId ?? liveDuel);
  const muted = useMuted();
  // Pips remembers the last game opened; the hub offers it first.
  useEffect(() => rememberGame(pathname), [pathname]);
  const page = pathname === "/games/rank" ? GAMES.rank.title : pathname === "/games/history" ? GAMES.history.title : null;
  if (page) {
    return (
      <div className="gm-rail">
        <div className="gm-rail-inner">
          <Link href="/games" className="gm-rail-icon" aria-label={GAMES.rail.back} title={GAMES.rail.back}>
            <ChevronLeft aria-hidden />
          </Link>
          <h1 className="gm-rail-mode">{page}</h1>
          <div className="gm-rail-right">
            <SettingsButton onOpen={() => { feedback("tap"); setSettingsOpen(true); }} />
          </div>
        </div>
      </div>
    );
  }
  if (!entry) return null;

  return (
    <>
      {howToWanted ? <HowToSheet id={entry.id} open={howTo} onClose={() => setHowTo(false)} /> : null}
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
            <button type="button" className="gm-rail-icon" onClick={() => { setHowToWanted(true); setHowTo(true); }} aria-label={GAMES.howToWords.open} title={GAMES.howToWords.open}>
              <CircleHelp aria-hidden />
            </button>
            <button type="button" className="gm-rail-icon gm-rail-mute" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? GAMES.rail.sound : GAMES.rail.mute} title={muted ? GAMES.rail.sound : GAMES.rail.mute}>
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
