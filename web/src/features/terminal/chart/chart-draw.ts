// Ported from Owarine ecb7565b:web/src/features/terminal/chart/chart-draw.ts — the 見通し watermark (Mitoshi's mark) in
// place of 終値; level colours from `levelColour` (DESIGN.md chart map); a flat chart's pill has no PnL row.
/**
 * The chart's drawing primitives, shared by the line and candle views (Tradash's grid, axis, watermark, level lines and
 * tags, and the capsule pill). Each takes the canvas context and the theme; nothing here keeps state.
 */
import type { CanvasOdometer } from "./canvas-odometer";
import { LABEL_RIGHT, LEVEL_STYLE, levelColour, PAD_Y, textOn, PILL_H, PILL_H_POSITION, PILL_RIGHT, TAG_H, type ChartLevel, type ChartTheme } from "./chart-style";
import { edgeAlpha, formatPrice, gridTicks, labelDecimals, yOf, type YWindow } from "./engine";

const span = (win: YWindow) => [win.center - win.half * 1.2, win.center + win.half * 1.2] as const;

export function drawWaiting(ctx: CanvasRenderingContext2D, theme: ChartTheme, text: string, w: number, h: number): void {
  ctx.font = theme.tagFont;
  ctx.fillStyle = theme.helper;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
}

/** Major grid lines across the plot, 6 % ink. */
export function drawGrid(ctx: CanvasRenderingContext2D, theme: ChartTheme, win: YWindow, step: number, plotW: number): void {
  ctx.strokeStyle = theme.ink;
  ctx.globalAlpha = 0.06;
  ctx.lineWidth = 1;
  for (const t of gridTicks(...span(win), step)) {
    if (!t.major) continue;
    const y = Math.round(yOf(t.value, win)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(plotW, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Tick marks on both edges (major 6 px, minor 3 px) and major labels at the right, fading near the edges and the pill. */
export function drawAxis(ctx: CanvasRenderingContext2D, theme: ChartTheme, win: YWindow, step: number, w: number, headY: number, pillH: number): void {
  const decimals = labelDecimals(win.center, step);
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.helper;
  ctx.font = theme.axisFont;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const t of gridTicks(...span(win), step)) {
    const y = Math.round(yOf(t.value, win)) + 0.5;
    const edge = edgeAlpha(Math.min(y - win.top, win.bottom - y));
    if (edge <= 0) continue;
    const len = t.major ? 6 : 3;
    ctx.globalAlpha = (t.major ? 0.9 : 0.45) * edge;
    ctx.beginPath();
    ctx.moveTo(3, y);
    ctx.lineTo(3 + len, y);
    ctx.moveTo(w - 3, y);
    ctx.lineTo(w - 3 - len, y);
    ctx.stroke();
    if (!t.major) continue;
    ctx.globalAlpha = edge * edgeAlpha(Math.abs(y - headY) - (pillH / 2 + 4));
    if (ctx.globalAlpha <= 0) continue;
    ctx.fillStyle = theme.helper;
    ctx.fillText(`$${formatPrice(t.value, decimals)}`, w - LABEL_RIGHT, y);
  }
  ctx.globalAlpha = 1;
}

const MARK = "見通し";

/** 見通し behind everything at 7 %, at most half the plot (260 px) wide. */
export function drawWatermark(ctx: CanvasRenderingContext2D, theme: ChartTheme, plotW: number, h: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.globalAlpha = 0.07;
  ctx.font = theme.markFont;
  ctx.fillStyle = theme.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const scale = Math.min(0.5 * plotW, 260) / (ctx.measureText(MARK).width || 1);
  ctx.translate(plotW / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.fillText(MARK, 0, 0);
  ctx.restore();
}

function tag(ctx: CanvasRenderingContext2D, theme: ChartTheme, text: string, x: number, y: number, width: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, width, TAG_H, 3);
  ctx.fill();
  // Ink tags (Entry) carry the inverse ink; coloured tags whichever text reads on them, as the pill does.
  ctx.fillStyle = fill === theme.ink ? theme.inverse : textOn(ctx, theme, fill);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 5, y + TAG_H / 2 + 0.5);
}

/** A level's dashed line and axis tag, or, off-screen, a tag pinned 9 px inside the edge pointing the way. */
export function drawLevel(ctx: CanvasRenderingContext2D, theme: ChartTheme, level: ChartLevel, win: YWindow, plotW: number, w: number, tone: string): void {
  const style = LEVEL_STYLE[level.kind];
  const colour = levelColour(level.kind, theme, tone);
  const y = yOf(level.price, win);
  ctx.font = style.strong ? theme.tagStrongFont : theme.tagFont;
  if (y < win.top - 2 || y > win.bottom + 2) {
    const up = y < win.top;
    const text = `${up ? "▲" : "▼"} ${level.label} $${formatPrice(level.price)}`;
    ctx.font = theme.tagStrongFont;
    const tw = ctx.measureText(text).width + 10;
    ctx.globalAlpha = 0.9;
    tag(ctx, theme, text, w - LABEL_RIGHT - tw, up ? win.top - PAD_Y + 9 : win.bottom + PAD_Y - 9 - TAG_H, tw, colour);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.globalAlpha = style.alpha;
  ctx.lineWidth = style.width;
  ctx.setLineDash(style.dash);
  ctx.beginPath();
  ctx.moveTo(0, Math.round(y) + 0.5);
  ctx.lineTo(plotW, Math.round(y) + 0.5);
  ctx.stroke();
  ctx.restore();
  const tw = ctx.measureText(level.label).width + 10;
  tag(ctx, theme, level.label, w - LABEL_RIGHT - tw, y - TAG_H / 2, tw, colour);
}

/** The capsule pill at the axis: the price rolling, and with a position the PnL beneath it; kept inside the canvas. */
export function drawPill(ctx: CanvasRenderingContext2D, theme: ChartTheme, w: number, h: number, headY: number, pillW: number, tone: string, price: CanvasOdometer, pnl: CanvasOdometer | null): void {
  const pillH = pnl ? PILL_H_POSITION : PILL_H;
  const x = w - PILL_RIGHT - pillW;
  const y = Math.min(h - pillH - 2, Math.max(2, headY - pillH / 2));
  ctx.fillStyle = tone;
  ctx.beginPath();
  ctx.roundRect(x, y, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = textOn(ctx, theme, tone);
  const right = x + pillW - 9;
  if (!pnl) {
    ctx.font = theme.pillFont;
    price.draw(ctx, right, y + pillH / 2 + 0.5, 20, y, y + pillH);
    return;
  }
  const mid = y + pillH / 2;
  ctx.font = theme.pillPriceFont;
  price.draw(ctx, right, mid - 7, 16, y, mid);
  ctx.font = theme.pillPnlFont;
  pnl.draw(ctx, right, mid + 8, 14, mid, y + pillH);
}
