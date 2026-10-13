"use client";

// A game playing itself (R4-9, D-227; ported from Senryo:packages/arcade/src/attract.ts — "show the game itself"):
// the real engine and drawing, steered by an autopilot, on a real-price tape when the server has one, a new run a
// beat after each ends. Silent, unranked, and only while on screen (IntersectionObserver); still under reduced motion,
// where the cabinet shows its static scene instead.
import { createFlapState, createRng, FLAP, stepFlap, type ArcadeGame, type ArcadeRunConfig, type FlapState } from "@cwf/core/games/arcade";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFlapFx, drawFlap } from "./flap-draw";
import { localSeed, type ArcadeRun } from "./run";
import { SledCanvas } from "./SledCanvas";
import { useArcadeLoop, useArcadeSurface, type ArcadeView, type LoopDriver } from "./useArcadeLoop";
import "./arcade.css";

const RESTART_TICKS = 90;

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

export interface AttractTape {
  feed: string;
  fromSec: number;
  toSec: number;
  points: readonly number[];
  moves: readonly number[];
}

export function AttractCanvas({ game, tape }: { game: ArcadeGame; tape: AttractTape | null }) {
  if (game === "line-rider") return <SledAttract tape={tape} />;
  return <FlapAttract tape={tape} />;
}

/** The sled plays itself (Senryo's autopilot) on the whole cabinet window, the real chart under it. */
function SledAttract({ tape }: { tape: AttractTape | null }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const run = useMemo<ArcadeRun>(
    () => (tape && tape.moves.length > 1 ? { id: 1, seed: localSeed(), calm: false, moves: tape.moves, tapeMeta: { feed: tape.feed, fromSec: tape.fromSec, toSec: tape.toSec } } : { id: 1, seed: localSeed(), calm: false }),
    [tape],
  );
  return (
    <div ref={holder} className="ar-screen ar-attract-screen" aria-hidden>
      <SledCanvas run={run} autopilot paused={!visible} reduced={false} onHud={noop} onEnd={noop} onCue={noop} />
    </div>
  );
}

const noop = () => undefined;

function FlapAttract({ tape }: { tape: AttractTape | null }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  const points = tape?.points ?? null;
  const config: ArcadeRunConfig = points && points.length > 1 ? { calm: false, tape: points } : { calm: false };
  const driver = useRef<LoopDriver>(flapDriver(config));
  // A tape that arrives after mount restarts the show on it.
  useEffect(() => {
    driver.current = flapDriver(config);
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps

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
