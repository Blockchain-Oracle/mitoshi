"use client";

import {
  createRideState,
  createRng,
  qFromTarget,
  recordRideInput,
  RIDE_START_Q,
  rideScoreOf,
  STEP_SEC,
  stepRide,
  targetFromQ,
  ticksToMs,
  type ArcadeRunConfig,
  type RideState,
  type Rng,
} from "@cwf/core/games/arcade";
import { useCallback, useEffect, useRef, useState } from "react";
import { attachRideControls, type RideInput } from "./controls";
import { createRideFx, drawRide } from "./ride-draw";
import { IDLE_SEED, type ArcadeRun, type RunEnd } from "./run";
import { useArcadeLoop, useArcadeSurface, type ArcadeView, type LoopDriver } from "./useArcadeLoop";

/**
 * The ride on a canvas: the engine's state, the inputs, the trace, and the loop that steps them.
 *
 * The component holds nothing React needs to re-render for. The state, the generator, the trace and
 * the input live in refs and are read by the loop; React sees a throttled HUD snapshot twenty times a
 * second and one call when the run ends. Every input the step consumed is in the trace by the tick it
 * applied to, which is what makes the run the server replays the run the player played.
 */
export interface RideHud {
  score: number;
  multiplier: number;
  grip: number;
  elapsedSec: number;
  onLine: boolean;
  intensity: number;
}

/** The pip found the line again; the combo crossed a whole number (which one rides along). */
export type RideCue = { kind: "regain" } | { kind: "milestone"; mult: number };

/** How fast a held arrow key moves the wheel, in wheel units a second. */
const KEY_RATE = 1.4;
const HUD_EVERY_TICKS = 3;

export function RideCanvas({ run, reduced, onHud, onEnd, onCue, paused = false }: { run: ArcadeRun | null; reduced: boolean; /** The stage holds the run (R4-9, D-227); the step counter stops, so the replay is the same run. */ paused?: boolean; onHud: (hud: RideHud) => void; onEnd: (end: RunEnd) => void; onCue: (cue: RideCue) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<RideState>(createRideState(createRng(IDLE_SEED), { calm: false }));
  const rngRef = useRef<Rng>(createRng(IDLE_SEED));
  const configRef = useRef<ArcadeRunConfig>({ calm: false });
  const traceRef = useRef<number[]>([]);
  const inputRef = useRef<RideInput>({ target: targetFromQ(RIDE_START_Q), held: 0 });
  const fxRef = useRef(createRideFx());
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const runRef = useRef<ArcadeRun | null>(null);
  const [running, setRunning] = useState(false);

  const callbacks = useRef({ onHud, onEnd, onCue });
  callbacks.current = { onHud, onEnd, onCue };

  const hud = useCallback((state: RideState) => {
    callbacks.current.onHud({ score: rideScoreOf(state), multiplier: state.mult, grip: state.grip, elapsedSec: state.elapsedSec, onLine: state.onLine, intensity: state.difficulty });
  }, []);

  const driverRef = useRef<LoopDriver>({
    step() {
      const state = stateRef.current;
      const active = runRef.current;
      if (!active || state.over) return;
      const input = inputRef.current;
      if (input.held) input.target = Math.min(1, Math.max(0, input.target + input.held * KEY_RATE * STEP_SEC));
      const q = qFromTarget(input.target);
      recordRideInput(traceRef.current, state.tick, q);
      stepRide(state, q, rngRef.current, configRef.current);
      if (state.regained) callbacks.current.onCue({ kind: "regain" });
      if (state.milestoneHit) callbacks.current.onCue({ kind: "milestone", mult: state.milestoneHit });
      if (state.tick % HUD_EVERY_TICKS === 0) hud(state);
      if (state.over) {
        hud(state);
        setRunning(false);
        callbacks.current.onEnd({ game: "line-rider", seed: active.seed, calm: active.calm, score: rideScoreOf(state), ticks: state.tick, durationMs: ticksToMs(state.tick), trace: traceRef.current });
      }
    },
    draw(view: ArcadeView, alpha: number, nowMs: number) {
      drawRide(view, stateRef.current, alpha, nowMs, fxRef.current, reducedRef.current);
    },
  });

  const viewRef = useArcadeSurface(
    canvasRef,
    useCallback((view: ArcadeView) => driverRef.current.draw(view, 1, performance.now()), []),
  );
  useArcadeLoop(driverRef, viewRef, running && !paused);

  // A new run: fresh dice, a fresh state on the run's seed, the wheel centred, the controls attached.
  useEffect(() => {
    if (!run) return;
    runRef.current = run;
    rngRef.current = createRng(run.seed);
    configRef.current = { calm: run.calm };
    stateRef.current = createRideState(rngRef.current, configRef.current);
    traceRef.current = [];
    inputRef.current.target = targetFromQ(RIDE_START_Q);
    inputRef.current.held = 0;
    fxRef.current = createRideFx();
    hud(stateRef.current);
    setRunning(true);
    const canvas = canvasRef.current;
    const detach = canvas ? attachRideControls(canvas, inputRef.current) : () => undefined;
    return () => {
      detach();
      runRef.current = null;
    };
  }, [run, hud]);

  return <canvas ref={canvasRef} className="ar-canvas" aria-hidden />;
}
