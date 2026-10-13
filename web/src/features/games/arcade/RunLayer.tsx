"use client";

// The arcade's stage (R4-9, D-227; ported from Senryo:apps/web/src/features/games/arcade/ArcadeStage.tsx): a run takes
// the whole screen — the page asked for full screen and landscape inside the Play tap; this fixed layer covers the
// viewport where the browser can't (an iPhone) — counts 3-2-1-GO with its beeps, starts the music, and plays the
// engine. A run that will not be posted can pause (the button, Esc, P); a posted run can't (Senryo's rule). The run's
// end is the engine's: then the game-over card with the server's replay verdict. Leaving stops the music and full screen.
import type { ArcadeGame } from "@cwf/core/games/arcade";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { startBgm, stopBgm } from "../audio";
import { useGames } from "../GamesProvider";
import { countSfx, hopCrashSfx, hopScoreSfx, milestoneSfx, regainSfx, rideCrashSfx, rideStartSfx } from "./arcade-sfx";
import { ARCADE } from "./copy";
import { FlapCanvas, type FlapCue, type FlapHud } from "./FlapCanvas";
import { RideCanvas, type RideCue, type RideHud } from "./RideCanvas";
import { localSeed, type ArcadeRun, type RunEnd } from "./run";
import { Countdown, OverPlate, PausePlate, StageTop, type StageResult } from "./StageParts";
import type { PostAbility, PostOutcome } from "./useArcadeScore";

type Phase = "countdown" | "playing" | "paused" | "over";
const COUNT_MS = 600;
const COUNT_FROM = 3;

export interface RunLayerProps {
  game: ArcadeGame;
  seed: string | null;
  calm: boolean;
  best: number | null;
  ability: PostAbility;
  post: (end: RunEnd) => Promise<PostOutcome>;
  refresh: () => Promise<unknown>;
  onSignIn: () => void;
  onFinished: (score: number) => void;
  onClose: () => void;
}

function noteOf(ability: PostAbility, outcome: PostOutcome | null): Pick<StageResult, "note" | "tone"> {
  if (outcome?.kind === "posted") return { note: outcome.rank === 1 ? ARCADE.over.topOfBoard : ARCADE.over.ranked(outcome.rank), tone: null };
  if (outcome?.kind === "refused") return { note: ARCADE.over.refused(outcome.why), tone: "refused" };
  if (ability === "yes") return { note: null, tone: null };
  return { note: ability === "signedOut" ? ARCADE.over.local.signedOut : ARCADE.over.local.noStore, tone: null };
}

export function RunLayer({ game, seed, calm, best, ability, post, refresh, onSignIn, onFinished, onClose }: RunLayerProps) {
  const { reducedMotion, feedback } = useGames();
  const words = ARCADE.games[game];
  const [phase, setPhase] = useState<Phase>("countdown");
  const [count, setCount] = useState(COUNT_FROM);
  const [run, setRun] = useState<ArcadeRun | null>(null);
  const [hud, setHud] = useState({ score: 0, combo: 1 });
  const [result, setResult] = useState<StageResult | null>(null);
  const streak = useRef(0);
  const runId = useRef(0);
  const canPause = ability !== "yes";

  // 3-2-1-GO, then the run and the music.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) {
      countSfx(true);
      const t = window.setTimeout(() => {
        startBgm();
        if (game === "line-rider") rideStartSfx();
        streak.current = 0;
        runId.current += 1;
        setRun({ id: runId.current, seed: seed ?? localSeed(), calm });
        setPhase("playing");
      }, COUNT_MS);
      return () => window.clearTimeout(t);
    }
    countSfx(false);
    const t = window.setTimeout(() => setCount((n) => n - 1), COUNT_MS);
    return () => window.clearTimeout(t);
  }, [phase, count, game, seed, calm]);

  const onEnd = useCallback(
    (end: RunEnd) => {
      if (game === "line-rider") {
        rideCrashSfx();
        feedback("crash");
      }
      stopBgm();
      onFinished(end.score);
      const isBest = best !== null && end.score > best;
      const stats = [
        { label: ARCADE.stage.length, value: ARCADE.over.length((end.durationMs / 1_000).toFixed(1)) },
        { label: ARCADE.stage.seed, value: end.seed },
      ];
      // A first run sets the best; only beating one is a new best (Senryo).
      const card = (outcome: PostOutcome | null): StageResult => ({ score: end.score, isBest, stats, ...noteOf(ability, outcome) });
      setResult(card(null));
      setPhase("over");
      if (isBest) feedback("card-win");
      if (ability === "yes") void post(end).then((outcome) => setResult(card(outcome)));
      else void refresh();
    },
    [ability, best, feedback, game, onFinished, post, refresh],
  );

  const onRideHud = useCallback((h: RideHud) => setHud({ score: h.score, combo: h.multiplier }), []);
  const onFlapHud = useCallback((h: FlapHud) => setHud({ score: h.score, combo: 1 }), []);
  const onRideCue = useCallback(
    (cue: RideCue) => {
      if (cue.kind === "milestone") {
        milestoneSfx(cue.mult);
        feedback("confirm");
      } else regainSfx();
    },
    [feedback],
  );
  const onFlapCue = useCallback(
    (cue: FlapCue) => {
      if (cue === "flap") feedback("tap");
      else if (cue === "score") hopScoreSfx(streak.current++);
      else {
        hopCrashSfx();
        feedback("crash");
      }
    },
    [feedback],
  );

  // Esc / P pause a run that may pause; the page under the stage holds still; leaving ends the music and full screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Escape" || e.key === "p" || e.key === "P") && canPause) setPhase((p) => (p === "playing" ? "paused" : p));
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      stopBgm();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [canPause]);

  const again = () => {
    feedback("tap");
    setResult(null);
    setHud({ score: 0, combo: 1 });
    setCount(COUNT_FROM);
    setPhase("countdown");
  };
  const share = () => {
    if (!result) return;
    const url = `${window.location.origin}/games/${game}`;
    const text = ARCADE.stage.shareText(ARCADE.fmt(result.score), words.title);
    if (navigator.share) void navigator.share({ title: words.title, text, url }).catch(() => undefined);
    else void navigator.clipboard?.writeText(`${text} ${url}`).catch(() => undefined);
  };
  const paused = phase === "paused" || phase === "over";
  const combo = game === "line-rider" && hud.combo >= 2 ? ARCADE.hud.combo(hud.combo) : null;

  return createPortal(
    <div className="as-layer gm-stage-layer" data-phase={phase} data-reduced-motion={reducedMotion ? "true" : "false"}>
      <div className="ar-screen as-screen" data-phase={phase === "playing" ? "playing" : "title"}>
        {game === "line-rider" ? (
          <RideCanvas run={run} paused={paused} reduced={reducedMotion} onHud={onRideHud} onEnd={onEnd} onCue={onRideCue} />
        ) : (
          <FlapCanvas run={run} paused={paused} reduced={reducedMotion} onHud={onFlapHud} onEnd={onEnd} onCue={onFlapCue} />
        )}
      </div>
      <div className="as-hud">
        <StageTop score={hud.score} combo={combo} best={best} canPause={canPause && phase === "playing"} onPause={() => setPhase("paused")} onExit={onClose} />
        <span className="as-dim as-hint">{phase === "playing" || phase === "countdown" ? words.control : ""}</span>
      </div>
      {phase === "countdown" ? <Countdown n={count} /> : null}
      {phase === "paused" ? <PausePlate onResume={() => setPhase("playing")} onExit={onClose} /> : null}
      {phase === "over" && result ? <OverPlate title={words.title} result={result} signedIn={ability !== "signedOut"} onSignIn={onSignIn} onAgain={again} onShare={share} onExit={onClose} /> : null}
    </div>,
    document.body,
  );
}
