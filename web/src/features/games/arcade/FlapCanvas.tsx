"use client";

import { createFlapState, createRng, stepFlap, ticksToMs, type ArcadeRunConfig, type FlapState, type Rng } from "@cwf/core/games/arcade";
import { useCallback, useEffect, useRef, useState } from "react";
import { attachFlapControls } from "./controls";
import { createFlapFx, drawFlap, flapFxPress } from "./flap-draw";
import { IDLE_SEED, type ArcadeRun, type RunEnd } from "./run";
import { useArcadeLoop, useArcadeSurface, type ArcadeView, type LoopDriver } from "./useArcadeLoop";

/**
 * The hop on a canvas — the ride's twin, with one bit of input. A press between two steps is held
 * until the next step consumes it, so a tap is never lost to timing; the tick it applied to is what
 * the trace records. The engine keeps the fall, so the run ends only once the coin has dropped out.
 */
export interface FlapHud {
  score: number;
  elapsedSec: number;
  alive: boolean;
}

export type FlapCue = "score" | "crash" | "flap";

const HUD_EVERY_TICKS = 3;

export function FlapCanvas({ run, reduced, onHud, onEnd, onCue }: { run: ArcadeRun | null; reduced: boolean; onHud: (hud: FlapHud) => void; onEnd: (end: RunEnd) => void; onCue: (cue: FlapCue) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<FlapState>(createFlapState(createRng(IDLE_SEED), { calm: false }));
  const rngRef = useRef<Rng>(createRng(IDLE_SEED));
  const configRef = useRef<ArcadeRunConfig>({ calm: false });
  const traceRef = useRef<number[]>([]);
  const pressedRef = useRef(false);
  const fxRef = useRef(createFlapFx());
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const runRef = useRef<ArcadeRun | null>(null);
  const [running, setRunning] = useState(false);

  const callbacks = useRef({ onHud, onEnd, onCue });
  callbacks.current = { onHud, onEnd, onCue };

  const hud = useCallback((state: FlapState) => {
    callbacks.current.onHud({ score: state.score, elapsedSec: state.elapsedSec, alive: !state.over && !state.dying });
  }, []);

  const driverRef = useRef<LoopDriver>({
    step() {
      const state = stateRef.current;
      const active = runRef.current;
      if (!active || state.over) return;
      const flap = pressedRef.current && !state.dying;
      pressedRef.current = false;
      if (flap) {
        traceRef.current.push(state.tick);
        if (!reducedRef.current) flapFxPress(fxRef.current, state);
        callbacks.current.onCue("flap");
      }
      stepFlap(state, flap, rngRef.current, configRef.current);
      if (state.scored) callbacks.current.onCue("score");
      if (state.crashed) {
        hud(state);
        callbacks.current.onCue("crash");
      }
      if (state.tick % HUD_EVERY_TICKS === 0) hud(state);
      if (state.over) {
        hud(state);
        setRunning(false);
        callbacks.current.onEnd({ game: "candle-hop", seed: active.seed, calm: active.calm, score: state.score, ticks: state.tick, durationMs: ticksToMs(state.tick), trace: traceRef.current });
      }
    },
    draw(view: ArcadeView, alpha: number, nowMs: number) {
      drawFlap(view, stateRef.current, alpha, nowMs, fxRef.current, reducedRef.current);
    },
  });

  const viewRef = useArcadeSurface(
    canvasRef,
    useCallback((view: ArcadeView) => driverRef.current.draw(view, 1, performance.now()), []),
  );
  useArcadeLoop(driverRef, viewRef, running);

  useEffect(() => {
    if (!run) return;
    runRef.current = run;
    rngRef.current = createRng(run.seed);
    configRef.current = { calm: run.calm };
    stateRef.current = createFlapState(rngRef.current, configRef.current);
    traceRef.current = [];
    pressedRef.current = false;
    fxRef.current = createFlapFx();
    hud(stateRef.current);
    setRunning(true);
    const canvas = canvasRef.current;
    const detach = canvas
      ? attachFlapControls(canvas, () => {
          pressedRef.current = true;
        })
      : () => undefined;
    return () => {
      detach();
      runRef.current = null;
    };
  }, [run, hud]);

  return <canvas ref={canvasRef} className="ar-canvas" aria-hidden />;
}
