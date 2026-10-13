"use client";

// A game playing itself (R4-9, D-227; ported from Senryo:packages/arcade/src/attract.ts — "show the game itself"):
// the real engine and drawing, steered by an autopilot, on a real-price tape when the server has one, a new run a
// beat after each ends. Silent, unranked, and only while on screen (IntersectionObserver); still under reduced motion,
// where the cabinet shows its static scene instead.
import { createFlapState, createRideState, createRng, FLAP, RIDE, rideLineYAt, stepFlap, stepRide, TARGET_Q_MAX, type ArcadeGame, type ArcadeRunConfig, type FlapState, type RideState } from "@cwf/core/games/arcade";
import { useEffect, useRef, useState } from "react";
import { createFlapFx, drawFlap } from "./flap-draw";
import { createRideFx, drawRide } from "./ride-draw";
import { localSeed } from "./run";
import { useArcadeLoop, useArcadeSurface, type ArcadeView, type LoopDriver } from "./useArcadeLoop";
import "./arcade.css";

const RESTART_TICKS = 90;
/** How far ahead of the pip the autopilot reads the line, in field units — a rider looks where it is going. */
const LOOK_AHEAD = 18;

function rideDriver(config: ArcadeRunConfig): LoopDriver {
  let rng = createRng(localSeed());
  let state: RideState = createRideState(rng, config);
  let after = 0;
  const fx = createRideFx();
  return {
    step() {
      if (state.over) {
        if (++after < RESTART_TICKS) return;
        rng = createRng(localSeed());
        state = createRideState(rng, config);
        after = 0;
      }
      const lineY = rideLineYAt(state, RIDE.pipX + LOOK_AHEAD);
      const target = (RIDE.pipLo - lineY) / (RIDE.pipLo - RIDE.pipHi);
      stepRide(state, Math.round(Math.min(1, Math.max(0, target)) * TARGET_Q_MAX), rng, config);
    },
    draw: (view: ArcadeView, alpha: number, nowMs: number) => drawRide(view, state, alpha, nowMs, fx, false),
  };
}

function flapDriver(config: ArcadeRunConfig): LoopDriver {
  let rng = createRng(localSeed());
  let state: FlapState = createFlapState(rng, config);
  let after = 0;
  const fx = createFlapFx();
  return {
    step() {
      if (state.over) {
        if (++after < RESTART_TICKS) return;
        rng = createRng(localSeed());
        state = createFlapState(rng, config);
        after = 0;
      }
      // Kick when below the next gap's centre and falling.
      const next = state.candles.find((c) => c.x + FLAP.bodyW / 2 >= FLAP.birdX);
      const goal = next ? next.center + next.half * 0.25 : 0.5;
      stepFlap(state, !state.dying && state.birdY > goal && state.vy >= 0, rng, config);
    },
    draw: (view: ArcadeView, alpha: number, nowMs: number) => drawFlap(view, state, alpha, nowMs, fx, false),
  };
}

export function AttractCanvas({ game, tape }: { game: ArcadeGame; tape: readonly number[] | null }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  const config: ArcadeRunConfig = tape && tape.length > 1 ? { calm: false, tape } : { calm: false };
  const driver = useRef<LoopDriver>(game === "line-rider" ? rideDriver(config) : flapDriver(config));
  // A tape that arrives after mount restarts the show on it.
  useEffect(() => {
    driver.current = game === "line-rider" ? rideDriver(config) : flapDriver(config);
  }, [game, tape]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const view = useArcadeSurface(canvas, (v) => driver.current.draw(v, 1, performance.now()));
  useArcadeLoop(driver, view, visible);
  // The draws read the field's ink from `.ar-screen`'s triplets, so the canvas sits in one.
  return (
    <div className="ar-screen ar-attract-screen" aria-hidden>
      <canvas ref={canvas} className="ar-canvas" />
    </div>
  );
}
