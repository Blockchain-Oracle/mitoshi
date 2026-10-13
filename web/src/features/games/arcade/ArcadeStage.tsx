"use client";

import type { ArcadeGame } from "@cwf/core/games/arcade";
import { Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useWalletSession } from "@/lib/wallet-session";
import { GameScene } from "../art/scenes";
import { AttractCanvas } from "./AttractCanvas";
import { useGames } from "../GamesProvider";
import { ArcadeBoard } from "./ArcadeBoard";
import { ARCADE } from "./copy";
import { RunLayer } from "./RunLayer";
import { useArcadeScore } from "./useArcadeScore";
import "./arcade.css";

/**
 * `/games/line-rider` and `/games/candle-hop` — the cabinet (R4-9, D-227; ported from
 * Senryo:apps/web/src/features/games/arcade/ArcadeScreen.tsx): the game's own scene with a big Play, your best, the
 * board, and the calmer ramp as a switch. Play asks for full screen and landscape inside the tap (as browsers require)
 * and hands the run to the stage (`RunLayer`): 3-2-1-GO, the HUD, the game-over card. Signed in, a run posts to the
 * board once the server's replay reproduces it; signed out it plays the same game and the card offers sign-in. How a
 * score is checked sits behind the rail's ⓘ.
 */
function goFullScreen(): void {
  const el = document.documentElement;
  if (!el.requestFullscreen || document.fullscreenElement) return;
  el.requestFullscreen({ navigationUI: "hide" }).then(
    () => {
      const o = screen.orientation as ScreenOrientation & { lock?: (to: string) => Promise<void> };
      void o.lock?.("landscape").catch(() => undefined);
    },
    () => undefined,
  );
}

export function ArcadeStage({ game }: { game: ArcadeGame }) {
  const { reducedMotion, feedback } = useGames();
  const { address, connectFor } = useWalletSession();
  const { board, refresh, post, ability } = useArcadeScore(game);
  const words = ARCADE.games[game];
  const [playing, setPlaying] = useState(false);
  const [calm, setCalm] = useState(false);
  const [sessionBest, setSessionBest] = useState<number | null>(null);

  // Reduced motion offers the calmer ramp; it stays a choice the player can flip either way.
  useEffect(() => {
    if (reducedMotion) setCalm(true);
  }, [reducedMotion]);

  const boardBest = board?.me?.best ?? null;
  const best = sessionBest === null ? boardBest : boardBest === null ? sessionBest : Math.max(sessionBest, boardBest);
  const onFinished = useCallback((score: number) => setSessionBest((b) => (b === null ? score : Math.max(b, score))), []);

  const play = () => {
    feedback("tap");
    goFullScreen();
    setPlaying(true);
  };

  return (
    <div className="gm-page ar-cabinet">
      <div className="ar-attract">
        {reducedMotion || playing ? <GameScene game={game} /> : <AttractCanvas game={game} tape={board?.tape ?? null} />}
        <button type="button" className="du-cta ar-play" onClick={play} data-primary-action>
          <Play aria-hidden className="ar-play-icon" />
          {ARCADE.title.play}
        </button>
      </div>
      <p className="ar-line">{words.line}</p>
      <div className="ar-cab-row">
        <span className="ar-best">{best === null ? ARCADE.title.noBest : ARCADE.title.best(ARCADE.fmt(best))}</span>
        <label className="ar-calm">
          <span className="ar-calm-label">{ARCADE.calm.label}</span>
          <span className="ar-calm-hint">{ARCADE.calm.hint}</span>
          <Switch checked={calm} onCheckedChange={setCalm} aria-label={ARCADE.calm.label} />
        </label>
      </div>
      <ArcadeBoard board={board} you={address} post={{ kind: "local", why: null }} ability={ability} />
      <p className="ar-honesty">{ARCADE.honesty}</p>
      {playing ? (
        <RunLayer
          game={game}
          seed={board?.seed ?? null}
          tape={board?.tape ?? null}
          calm={calm}
          best={best}
          ability={ability}
          post={post}
          refresh={refresh}
          onSignIn={() => {
            setPlaying(false);
            connectFor(ARCADE.signIn);
          }}
          onFinished={onFinished}
          onClose={() => setPlaying(false)}
        />
      ) : null}
    </div>
  );
}
