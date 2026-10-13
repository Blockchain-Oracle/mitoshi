"use client";

// Ported from Senryo:apps/web/src/features/games/arcade/StageParts.tsx (R4-9, D-227) — the stage's plates: the HUD's
// top bar (score rolling on the kit Odometer, best, combo heat, then 44 px Sound, Pause and Exit), the 3-2-1-GO, the
// pause plate and the game-over card (score, a NEW BEST stamp, where it ranked by the server's replay, the run's
// numbers, Play again, Share, Exit). In the arena's ink; every control a 44 px button.
import { Pause, Play, Share2, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Odometer } from "@/components/kit";
import { toggleMute, useMuted } from "../audio";
import { ARCADE } from "./copy";

const CARD_READY_MS = 600;

export interface StageResult {
  score: number;
  isBest: boolean;
  /** The replay verdict and rank, or why the run stayed local; null while it is being checked. */
  note: string | null;
  tone: "refused" | null;
  stats: readonly { label: string; value: string }[];
}

export function StageTop({ score, combo, best, canPause, onPause, onExit }: { score: number; combo: string | null; best: number | null; canPause: boolean; onPause: () => void; onExit: () => void }) {
  const muted = useMuted();
  return (
    <div className="as-top">
      <div className="as-score-col">
        <Odometer kind="plain" value={score} className="as-score" />
        {best !== null ? <span className="as-dim">{ARCADE.title.best(ARCADE.fmt(best))}</span> : null}
      </div>
      {combo ? (
        <span key={combo} className="as-combo">
          {combo}
        </span>
      ) : (
        <span />
      )}
      <div className="as-icons">
        <button type="button" className="as-icon" aria-pressed={muted} aria-label={muted ? ARCADE.stage.sound : ARCADE.stage.mute} onClick={toggleMute}>
          {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
        </button>
        {canPause ? (
          <button type="button" className="as-icon" aria-label={ARCADE.stage.pause} onClick={onPause}>
            <Pause aria-hidden />
          </button>
        ) : null}
        <button type="button" className="as-icon" aria-label={ARCADE.stage.exit} onClick={onExit}>
          <X aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function Countdown({ n }: { n: number }) {
  return (
    <div className="as-count" aria-live="assertive">
      <span key={n} data-go={n === 0 || undefined}>
        {n === 0 ? ARCADE.stage.go : n}
      </span>
    </div>
  );
}

export function PausePlate({ onResume, onExit }: { onResume: () => void; onExit: () => void }) {
  return (
    <div className="as-plate">
      <div className="as-card">
        <span className="as-card-title">{ARCADE.stage.paused}</span>
        <button type="button" className="du-cta as-cta" onClick={onResume} autoFocus>
          <Play aria-hidden className="as-cta-icon" /> {ARCADE.stage.resume}
        </button>
        <button type="button" className="du-cta du-cta--quiet as-ghost" onClick={onExit}>
          {ARCADE.stage.exit}
        </button>
      </div>
    </div>
  );
}

export function OverPlate({ title, result, signedIn, onSignIn, onAgain, onShare, onExit }: { title: string; result: StageResult; signedIn: boolean; onSignIn: () => void; onAgain: () => void; onShare: () => void; onExit: () => void }) {
  // A key still held from the run (Space) must not land on the focused Play again: the card listens after a beat.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), CARD_READY_MS);
    return () => window.clearTimeout(t);
  }, []);
  const when = (act: () => void) => () => {
    if (ready) act();
  };
  return (
    <div className="as-plate" role="dialog" aria-label={`${title} · ${ARCADE.over.over}`}>
      <div className="as-card">
        <span className="as-dim as-card-eyebrow">{title}</span>
        <span className="as-score as-score--big">{ARCADE.fmt(result.score)}</span>
        {result.isBest ? <span className="as-stamp">{ARCADE.over.newBest}</span> : null}
        <span className="as-dim" data-tone={result.tone ?? undefined} aria-live="polite">
          {result.note ?? ARCADE.over.checking}
        </span>
        <dl className="as-stats">
          {result.stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="du-cta as-cta" onClick={when(onAgain)} autoFocus>
          {ARCADE.over.again}
        </button>
        <div className="as-row">
          <button type="button" className="du-cta du-cta--quiet as-ghost" onClick={when(onShare)}>
            <Share2 aria-hidden className="as-cta-icon" /> {ARCADE.stage.share}
          </button>
          <button type="button" className="du-cta du-cta--quiet as-ghost" onClick={when(onExit)}>
            {ARCADE.stage.exit}
          </button>
        </div>
        {signedIn ? null : (
          <button type="button" className="as-signin" onClick={onSignIn}>
            {ARCADE.over.local.signedOut}
          </button>
        )}
      </div>
    </div>
  );
}
