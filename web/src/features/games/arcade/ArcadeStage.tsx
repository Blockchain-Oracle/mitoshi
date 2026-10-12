"use client";

import type { ArcadeGame } from "@cwf/core/games/arcade";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWalletSession } from "@/lib/wallet-session";
import { gameEntry } from "../catalog";
import { useGames } from "../GamesProvider";
import { hopCrashSfx, hopScoreSfx, milestoneSfx, regainSfx, rideCrashSfx, rideStartSfx } from "./arcade-sfx";
import { ArcadeBoard } from "./ArcadeBoard";
import { OverOverlay, TitleOverlay, type PostState } from "./ArcadeOverlays";
import { ARCADE } from "./copy";
import { FlapCanvas, type FlapCue, type FlapHud } from "./FlapCanvas";
import { RideCanvas, type RideCue, type RideHud } from "./RideCanvas";
import { localSeed, type ArcadePhase, type ArcadeRun, type RunEnd } from "./run";
import { useArcadeScore, type PostAbility } from "./useArcadeScore";
import "./arcade.css";

/**
 * `/games/line-rider` and `/games/candle-hop` — one stage, two engines.
 *
 * The screen is the one dark island under `/games` (doc 06): its ground is part of the mechanic, so it
 * keeps the dark theme's values whatever the page wears, and the HUD and the two plates over it are in
 * the field's own ink. Around it the page follows the theme like every other stage: the honesty note,
 * the calm switch, the board.
 *
 * Phase is Pips's three: title, playing, over. A run is a seed and the calm flag — the seed from the
 * board's GET when it answered, the browser's own when it did not — and what ends a run is the engine,
 * never the player: there is no quit, so every run that ends is a run that can be posted. Posting
 * rides the caller's session (D-226); a signed-out player plays the same game and the board says "sign in to post".
 */
interface Hud {
  score: number;
  combo: number;
}

const HUD_ZERO: Hud = { score: 0, combo: 1 };

function localWhy(ability: PostAbility): PostState {
  return { kind: "local", why: ability === "signedOut" ? "signedOut" : ability === "noStore" ? "noStore" : ability === "yes" ? null : "unavailable" };
}

export function ArcadeStage({ game }: { game: ArcadeGame }) {
  const { reducedMotion, feedback } = useGames();
  const { address } = useWalletSession();
  const { board, refresh, post, ability } = useArcadeScore(game);
  const words = ARCADE.games[game];
  const Icon = gameEntry(game).nav.icon;

  const [phase, setPhase] = useState<ArcadePhase>("title");
  const [run, setRun] = useState<ArcadeRun | null>(null);
  const [calm, setCalm] = useState(false);
  const [hud, setHud] = useState<Hud>(HUD_ZERO);
  const [end, setEnd] = useState<RunEnd | null>(null);
  const [postState, setPostState] = useState<PostState>({ kind: "local", why: null });
  const [sessionBest, setSessionBest] = useState<number | null>(null);
  /** Gaps cleared in a row this run: the hop's "tuiing" climbs with it and it resets every run. */
  const streakRef = useRef(0);

  // Reduced motion offers the calmer ramp; it stays a choice the player can flip either way.
  useEffect(() => {
    if (reducedMotion) setCalm(true);
  }, [reducedMotion]);

  const start = useCallback(() => {
    feedback("tap");
    if (game === "line-rider") rideStartSfx();
    streakRef.current = 0;
    setEnd(null);
    setHud(HUD_ZERO);
    setPostState({ kind: "local", why: null });
    setRun((held) => ({ id: (held?.id ?? 0) + 1, seed: board?.seed ?? localSeed(), calm }));
    setPhase("playing");
  }, [board?.seed, calm, feedback, game]);

  const onEnd = useCallback(
    (result: RunEnd) => {
      // The hop already sounded its crash at the impact; the ride's wipeout is the moment grip runs out.
      if (game === "line-rider") {
        rideCrashSfx();
        feedback("crash");
      }
      setEnd(result);
      setPhase("over");
      setSessionBest((best) => (best === null ? result.score : Math.max(best, result.score)));
      if (ability === "yes") {
        setPostState({ kind: "checking" });
        void post(result).then((outcome) => {
          setPostState(outcome);
          if (outcome.kind === "posted" && outcome.isBest) feedback("card-win");
        });
      } else {
        setPostState(localWhy(ability));
        void refresh();
      }
    },
    [ability, feedback, game, post, refresh],
  );

  const onRideHud = useCallback((h: RideHud) => setHud({ score: h.score, combo: h.multiplier }), []);
  const onFlapHud = useCallback((h: FlapHud) => setHud({ score: h.score, combo: 1 }), []);
  const onRideCue = useCallback(
    (cue: RideCue) => {
      if (cue.kind === "milestone") {
        milestoneSfx(cue.mult);
        feedback("confirm");
      } else {
        regainSfx();
        feedback("tap");
      }
    },
    [feedback],
  );
  const onFlapCue = useCallback(
    (cue: FlapCue) => {
      if (cue === "flap") feedback("tap");
      else if (cue === "score") hopScoreSfx(streakRef.current++);
      else {
        hopCrashSfx();
        feedback("crash");
      }
    },
    [feedback],
  );

  const playing = phase === "playing";
  const boardBest = board?.me?.best ?? null;
  const best = sessionBest === null ? boardBest : boardBest === null ? sessionBest : Math.max(sessionBest, boardBest);
  const liveBest = playing ? Math.max(best ?? 0, hud.score) : best;

  return (
    <div className="container gm-page">
      <header className="ar-head">
        <span className="gm-eyebrow">{ARCADE.eyebrow}</span>
        <h1 className="ar-title">
          {words.title}
          <span className="accent">.</span>
        </h1>
      </header>

      <div className="ar-layout">
        <div className="ar-main">
          <div className="ar-screen crt-screen" data-phase={phase} tabIndex={-1}>
            <span className="ar-screw ar-screw--tl" aria-hidden />
            <span className="ar-screw ar-screw--tr" aria-hidden />
            <span className="ar-screw ar-screw--bl" aria-hidden />
            <span className="ar-screw ar-screw--br" aria-hidden />

            {game === "line-rider" ? (
              <RideCanvas run={run} reduced={reducedMotion} onHud={onRideHud} onEnd={onEnd} onCue={onRideCue} />
            ) : (
              <FlapCanvas run={run} reduced={reducedMotion} onHud={onFlapHud} onEnd={onEnd} onCue={onFlapCue} />
            )}

            {playing && (
              <div className="ar-hud" aria-live="off">
                <span className="ar-hud-k">{ARCADE.hud.score}</span>
                <span className="ar-hud-v">{ARCADE.fmt(hud.score)}</span>
                <span className="ar-hud-best">
                  {ARCADE.hud.best} <b>{ARCADE.fmt(liveBest ?? 0)}</b>
                </span>
                {game === "line-rider" && hud.combo >= 2 && <span className="ar-hud-combo">{ARCADE.hud.combo(hud.combo)}</span>}
              </div>
            )}

            {phase === "title" && <TitleOverlay game={game} best={best} onPlay={start} />}
            {phase === "over" && end && <OverOverlay end={end} post={postState} onAgain={start} />}
          </div>

          <div className="ar-readout">
            <span className="ar-readout-icon">
              <Icon aria-hidden />
            </span>
            <div>
              <p className="ar-readout-name">{words.readout}</p>
              <p className="ar-readout-hint">{words.control}</p>
            </div>
          </div>
        </div>

        <aside className="ar-side">
          <ArcadeBoard board={board} you={address} post={postState} ability={ability} />

          <label className="ar-note ar-calm">
            <input type="checkbox" checked={calm} disabled={playing} onChange={(event) => setCalm(event.target.checked)} />
            <span className="ar-calm-text">
              <span className="ar-calm-label">{ARCADE.calm.label}</span>
              <span className="ar-calm-hint">{ARCADE.calm.hint}</span>
            </span>
          </label>

          <div className="ar-note">
            <span className="ar-note-k">{ARCADE.note.label}</span>
            <p className="ar-note-body">{ARCADE.note.body}</p>
            <p className="ar-honesty">{ARCADE.honesty}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
