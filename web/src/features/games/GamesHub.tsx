"use client";

import { useNowMs } from "@/lib/clock";
import { GAMES } from "./copy";
import { useGames } from "./GamesProvider";
import { SettingsButton } from "./GamesRail";
import { AchievementsShelf } from "./hall/AchievementsShelf";
import { CabinetRail } from "./hall/CabinetRail";
import { FeaturedCabinet } from "./hall/FeaturedCabinet";
import { MatchTile } from "./duel/MatchTile";
import "./duel/duel.css";
import { NowPlaying } from "./hall/NowPlaying";
import { StreakStrip } from "./hall/StreakStrip";
import "./hall/hall.css";

/**
 * `/games` — the hall (R4-9, D-227; the games spec's "Gēsen" direction, after Senryo:apps/web/src/features/games/
 * GamesHub.tsx): every machine shows real activity and is one tap from play. One head row (the title, the now-playing
 * marquee, settings), the featured cabinet with its 52 px PLAY on the first phone screen, the cabinet rail, the streak
 * strip. No hero intro, no numbered sections, no profile plate of dashes — each cabinet's sticker says whose money is
 * at risk, and the rules sit behind each stage's ⓘ.
 */
export function GamesHub() {
  const nowMs = useNowMs();
  const { setSettingsOpen, feedback } = useGames();
  return (
    <div className="gm-page hall">
      <header className="hall-head">
        <h1 className="hall-title">{GAMES.title}</h1>
        <NowPlaying nowMs={nowMs} />
        <SettingsButton
          onOpen={() => {
            feedback("tap");
            setSettingsOpen(true);
          }}
        />
      </header>
      <MatchTile />
      <FeaturedCabinet nowMs={nowMs} />
      <CabinetRail nowMs={nowMs} />
      <StreakStrip />
      <AchievementsShelf />
    </div>
  );
}
