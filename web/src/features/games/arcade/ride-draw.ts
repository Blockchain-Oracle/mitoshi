import { FIELD_H, FIELD_W, lerp, RIDE, rideLineYAt, type RideState } from "@cwf/core/games/arcade";
import { heatOf, rgb, rgba, type Rgb } from "./palette";
import { drawSprite, PIP } from "./sprites";
import { applyFieldTransform, type ArcadeView } from "./useArcadeLoop";

/**
 * Line Rider's picture: Pips's field in the venue's colours, drawn in field units over a state the
 * engine owns. The line glows in the combo's heat (mint, then signal, then rose) with three layered
 * strokes standing in for a blur; the tolerance band is visible so "on" can be seen; a trail inks the
 * pip's path onto the scrolling tape; sparks fly on a dead-centre hug; a grip bar on the left reds out
 * and the field vignettes as it empties. Reduced motion keeps every state change and drops the sparks,
 * the trail and the pulse. Nothing here feeds back into the simulation.
 */
interface Trail {
  x: number;
  y: number;
  life: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface RideFx {
  trail: Trail[];
  sparks: Spark[];
  lastMs: number;
  lastWorldX: number;
}

export function createRideFx(): RideFx {
  return { trail: [], sparks: [], lastMs: 0, lastWorldX: 0 };
}

const RIM = 16;
const BAND_STEP = 6;
const TRAIL_MAX = 160;
const LOW_GRIP = 0.28;

function tracePath(ctx: CanvasRenderingContext2D, state: RideState, worldX: number, offset: number, reverse: boolean): void {
  if (!reverse) {
    for (let x = 0; x <= FIELD_W; x += BAND_STEP) {
      const y = rideLineYAt(state, x, worldX) * FIELD_H + offset;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else {
    for (let x = FIELD_W; x >= 0; x -= BAND_STEP) ctx.lineTo(x, rideLineYAt(state, x, worldX) * FIELD_H + offset);
  }
}

/**
 * The line's crisp core coloured by its move (R4-9, D-227; the games spec's "the line colours by move"): a rising
 * stretch in profit, a falling one in the vermilion accent — on a tape of real prints it reads as the chart it is.
 */
function strokeMoves(ctx: CanvasRenderingContext2D, state: RideState, worldX: number, up: Rgb, down: Rgb): void {
  let prevX = 0;
  let prevY = rideLineYAt(state, 0, worldX) * FIELD_H;
  for (let x = BAND_STEP; x <= FIELD_W; x += BAND_STEP) {
    const y = rideLineYAt(state, x, worldX) * FIELD_H;
    ctx.strokeStyle = rgb(y <= prevY ? up : down);
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();
    prevX = x;
    prevY = y;
  }
}

function advanceFx(fx: RideFx, state: RideState, dtSec: number, worldX: number, pipY: number, reduced: boolean): void {
  const drift = worldX - fx.lastWorldX;
  fx.lastWorldX = worldX;
  if (reduced || state.over) {
    fx.trail.length = 0;
    fx.sparks.length = 0;
    return;
  }
  fx.trail.push({ x: RIDE.pipX, y: pipY * FIELD_H, life: 1 });
  let kept = 0;
  for (const t of fx.trail) {
    t.x -= drift;
    t.life -= dtSec * 0.7;
    if (t.life > 0 && t.x > -20) fx.trail[kept++] = t;
  }
  fx.trail.length = Math.min(kept, TRAIL_MAX);

  if (state.onLine) {
    const hug = 1 - Math.min(1, Math.abs(pipY - rideLineYAt(state, RIDE.pipX, worldX)) / state.band);
    if (hug > 0.85 && Math.random() < dtSec * 22) {
      fx.sparks.push({ x: RIDE.pipX, y: pipY * FIELD_H, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40 - 10, life: 1 });
    }
  }
  let live = 0;
  for (const s of fx.sparks) {
    s.x += s.vx * dtSec;
    s.y += s.vy * dtSec;
    s.vy += 60 * dtSec;
    s.life -= dtSec * 2.2;
    if (s.life > 0) fx.sparks[live++] = s;
  }
  fx.sparks.length = live;
}

export function drawRide(view: ArcadeView, state: RideState, alpha: number, nowMs: number, fx: RideFx, reduced: boolean): void {
  const { ctx, palette } = view;
  applyFieldTransform(view);
  const dtSec = fx.lastMs ? Math.min(0.1, (nowMs - fx.lastMs) / 1_000) : 0;
  fx.lastMs = nowMs;

  const worldX = lerp(state.worldXPrev, state.worldX, alpha);
  const pipY = lerp(state.pipYPrev, state.pipY, alpha);
  const heat = heatOf(palette, state.mult);
  const hc = (a: number) => rgba(heat, a);
  advanceFx(fx, state, dtSec, worldX, pipY, reduced);

  ctx.fillStyle = rgb(palette.ground);
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  // The "now" guide at the pip.
  ctx.strokeStyle = rgba(palette.ink, 0.06);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(RIDE.pipX, 0);
  ctx.lineTo(RIDE.pipX, FIELD_H);
  ctx.stroke();

  // The tolerance band: the thing that makes "on the line" readable.
  const band = state.band * FIELD_H;
  ctx.beginPath();
  tracePath(ctx, state, worldX, -band, false);
  tracePath(ctx, state, worldX, band, true);
  ctx.closePath();
  ctx.fillStyle = hc(0.07);
  ctx.fill();

  // The line: a wide faint pass, a mid pass, then the crisp core, all in the heat — a halo without a blur.
  const flare = Math.min(1, state.mult / 10);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  tracePath(ctx, state, worldX, 0, false);
  ctx.strokeStyle = hc(0.12 + 0.1 * flare);
  ctx.lineWidth = 9 + 7 * flare;
  ctx.stroke();
  ctx.strokeStyle = hc(0.3 + 0.12 * flare);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.lineWidth = 2.4;
  strokeMoves(ctx, state, worldX, palette.up, palette.accent);

  if (fx.trail.length > 1) {
    ctx.lineWidth = 3;
    for (let i = 1; i < fx.trail.length; i += 1) {
      const a = fx.trail[i - 1] as Trail;
      const b = fx.trail[i] as Trail;
      ctx.strokeStyle = hc(0.5 * b.life);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  for (const s of fx.sparks) {
    ctx.fillStyle = rgba(palette.ink, s.life);
    ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
  }

  drawPip(ctx, palette.ink, heat, pipY * FIELD_H, state.onLine);
  drawGrip(ctx, palette.ink, palette.down, heat, state, nowMs, reduced);
}

function drawPip(ctx: CanvasRenderingContext2D, ink: Rgb, heat: Rgb, y: number, onLine: boolean): void {
  // The glow: two soft discs under the sprite, wider when riding.
  ctx.fillStyle = rgba(heat, onLine ? 0.28 : 0.14);
  ctx.beginPath();
  ctx.arc(RIDE.pipX, y, onLine ? 14 : 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(heat, onLine ? 0.4 : 0.2);
  ctx.beginPath();
  ctx.arc(RIDE.pipX, y, onLine ? 8 : 6, 0, Math.PI * 2);
  ctx.fill();
  drawSprite(ctx, PIP, { P: onLine ? rgb(ink) : rgb(heat), W: rgb(ink) }, RIDE.pipX, y, 2.2);
  if (onLine) {
    ctx.strokeStyle = rgba(heat, 0.6);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(RIDE.pipX, y, 11, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGrip(ctx: CanvasRenderingContext2D, ink: Rgb, down: Rgb, heat: Rgb, state: RideState, nowMs: number, reduced: boolean): void {
  const gx = RIM * 0.5;
  const top = RIM;
  const height = FIELD_H - RIM * 2;
  ctx.fillStyle = rgba(ink, 0.08);
  ctx.fillRect(gx, top, 4, height);
  const low = state.grip < LOW_GRIP;
  ctx.fillStyle = low ? rgb(down) : rgba(heat, 0.9);
  ctx.fillRect(gx, top + height * (1 - state.grip), 4, height * state.grip);

  if (!low) return;
  // The field reds at the edges as grip runs out; a pulse under full motion, a steady tint under reduced.
  const pulse = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(nowMs / 80);
  const a = ((LOW_GRIP - state.grip) / LOW_GRIP) * 0.5 * pulse;
  const g = ctx.createRadialGradient(FIELD_W / 2, FIELD_H / 2, FIELD_H * 0.25, FIELD_W / 2, FIELD_H / 2, FIELD_H * 0.75);
  g.addColorStop(0, rgba(down, 0));
  g.addColorStop(1, rgba(down, a));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}
