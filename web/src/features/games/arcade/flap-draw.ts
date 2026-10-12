import { FIELD_H, FIELD_W, FLAP, lerp, type FlapState } from "@cwf/core/games/arcade";
import { rgb, rgba, type Rgb } from "./palette";
import { COIN, drawSprite } from "./sprites";
import { applyFieldTransform, type ArcadeView } from "./useArcadeLoop";

/**
 * Candle Hop's picture: Pips's field in the venue's colours. Bearish candles hang from the ceiling in
 * the loss colour, bullish ones rise from the floor in the profit colour, each with a wick poking into
 * the gap; the flyer is the venue's coin, tilting with its fall; a faint grid scrolls behind for a
 * sense of motion; a hit shakes the screen, bursts at the impact and reds the edges as the coin drops
 * out. Reduced motion keeps the candles, the coin and the fall, and drops the grid, the trail, the
 * shake and the burst. Nothing here feeds back into the simulation.
 */
interface Trail {
  x: number;
  y: number;
  life: number;
}

export interface FlapFx {
  trail: Trail[];
  /** The coin's tilt, eased toward what its speed asks for — a look, not a fact the engine keeps. */
  angle: number;
  lastMs: number;
  lastWorldX: number;
}

export function createFlapFx(): FlapFx {
  return { trail: [], angle: -0.35, lastMs: 0, lastWorldX: 0 };
}

/** Called on every press the engine accepted, so the streak trails the coin. */
export function flapFxPress(fx: FlapFx, state: FlapState): void {
  fx.trail.push({ x: FLAP.birdX, y: state.birdY * FIELD_H, life: 1 });
}

const GRID = 64;
const SHAKE_SEC = 0.34;
const ROTATION_RESPONSE = 9;
const COIN_CELL = FLAP.birdH / COIN.h;

function advanceFx(fx: FlapFx, state: FlapState, dtSec: number, worldX: number, reduced: boolean): void {
  const drift = worldX - fx.lastWorldX;
  fx.lastWorldX = worldX;
  const fall = Math.min(1, Math.max(0, (state.vy + 0.3) / (FLAP.deathVyMax + 0.3)));
  const target = state.dying ? lerp(-0.18, 1.42, fall) : Math.max(-0.45, Math.min(1.05, state.vy * 0.48));
  fx.angle += (target - fx.angle) * (1 - Math.exp(-ROTATION_RESPONSE * dtSec));
  if (reduced) {
    fx.trail.length = 0;
    return;
  }
  let kept = 0;
  for (const t of fx.trail) {
    t.x -= drift;
    t.life -= dtSec * 1.6;
    if (t.life > 0 && t.x > -20) fx.trail[kept++] = t;
  }
  fx.trail.length = kept;
}

export function drawFlap(view: ArcadeView, state: FlapState, alpha: number, nowMs: number, fx: FlapFx, reduced: boolean): void {
  const { ctx, palette } = view;
  applyFieldTransform(view);
  const dtSec = fx.lastMs ? Math.min(0.1, (nowMs - fx.lastMs) / 1_000) : 0;
  fx.lastMs = nowMs;

  const worldX = lerp(state.worldXPrev, state.worldX, alpha);
  const birdY = lerp(state.birdYPrev, state.birdY, alpha) * FIELD_H;
  const birdX = FLAP.birdX + lerp(state.birdOffsetXPrev, state.birdOffsetX, alpha);
  const scroll = worldX - state.worldX;
  advanceFx(fx, state, dtSec, worldX, reduced);

  ctx.fillStyle = rgb(palette.ground);
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  ctx.save();
  if (state.dying && !reduced && state.deathElapsedSec < SHAKE_SEC) {
    const life = 1 - state.deathElapsedSec / SHAKE_SEC;
    const amount = 8 * (state.impact?.strength ?? 1) * life * life;
    ctx.translate((Math.random() * 2 - 1) * amount, (Math.random() * 2 - 1) * amount);
  }

  if (!reduced) {
    const parallax = (worldX * 0.4) % GRID;
    ctx.strokeStyle = rgba(palette.ink, 0.035);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -parallax; x <= FIELD_W; x += GRID) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD_H);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = rgba(palette.ink, 0.16);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.lineTo(FIELD_W, 0.5);
  ctx.moveTo(0, FIELD_H - 0.5);
  ctx.lineTo(FIELD_W, FIELD_H - 0.5);
  ctx.stroke();

  for (const c of state.candles) {
    const x = c.x + scroll;
    drawCandle(ctx, x, 0, (c.center - c.half) * FIELD_H, palette.down, 1);
    drawCandle(ctx, x, (c.center + c.half) * FIELD_H, FIELD_H, palette.up, -1);
  }

  for (const t of fx.trail) {
    ctx.fillStyle = rgba(palette.ink, 0.34 * t.life);
    ctx.beginPath();
    ctx.arc(t.x, t.y, 3 * t.life + 1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(birdX, birdY);
  ctx.rotate(fx.angle);
  drawSprite(ctx, COIN, { V: rgb(palette.accent), W: rgb(palette.ink), K: rgb(palette.ground) }, 0, 0, COIN_CELL);
  ctx.restore();

  if (state.dying && state.impact && !reduced) drawImpact(ctx, palette.ink, palette.down, state);
  ctx.restore();

  if (state.dying && state.impact) drawDeathVignette(ctx, palette.down, state);
}

/** One candlestick: a filled body with an outline, and a wick poking `dir` toward the gap. */
function drawCandle(ctx: CanvasRenderingContext2D, cx: number, top: number, bottom: number, colour: Rgb, dir: number): void {
  const height = bottom - top;
  if (height <= 0) return;
  const x = cx - FLAP.bodyW / 2;
  ctx.fillStyle = rgba(colour, 0.15);
  ctx.fillRect(x, top, FLAP.bodyW, height);
  ctx.strokeStyle = rgba(colour, 0.95);
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, top, FLAP.bodyW - 2, height);
  const from = dir > 0 ? bottom : top;
  ctx.beginPath();
  ctx.moveTo(cx, from);
  ctx.lineTo(cx, from + dir * FLAP.wick);
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawImpact(ctx: CanvasRenderingContext2D, ink: Rgb, down: Rgb, state: FlapState): void {
  if (state.deathElapsedSec >= 0.3 || !state.impact) return;
  const progress = state.deathElapsedSec / 0.3;
  const alpha = (1 - progress) * state.impact.strength;
  ctx.save();
  ctx.translate(state.impact.x, state.impact.y);
  ctx.lineCap = "square";
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4;
    const inner = 4 + progress * 7;
    const outer = inner + 10 * (1 - progress);
    ctx.strokeStyle = i % 2 === 0 ? rgba(ink, alpha) : rgba(down, alpha);
    ctx.lineWidth = i % 2 === 0 ? 2 : 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDeathVignette(ctx: CanvasRenderingContext2D, down: Rgb, state: FlapState): void {
  const strength = state.impact?.strength ?? 1;
  const impact = Math.min(1, Math.max(0, 1 - state.deathElapsedSec / 0.5));
  const alpha = strength * (0.18 + impact * 0.62);
  const radius = Math.hypot(FIELD_W, FIELD_H) * 0.62;
  const g = ctx.createRadialGradient(FIELD_W / 2, FIELD_H * 0.46, Math.min(FIELD_W, FIELD_H) * 0.18, FIELD_W / 2, FIELD_H * 0.46, radius);
  g.addColorStop(0, rgba(down, 0));
  g.addColorStop(0.58, rgba(down, alpha * 0.12));
  g.addColorStop(0.82, rgba(down, alpha * 0.48));
  g.addColorStop(1, rgba(down, alpha));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  if (impact > 0) {
    ctx.fillStyle = rgba(down, impact * strength * 0.09);
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  }
}
