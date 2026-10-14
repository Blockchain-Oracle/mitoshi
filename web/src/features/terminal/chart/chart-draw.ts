// Ported from Owarine ecb7565b:web/src/features/terminal/chart/chart-draw.ts — the 見通し watermark (Mitoshi's mark) in
// place of 終値; level colours from `levelColour` (DESIGN.md chart map); a flat chart's pill has no PnL row.
/**
 * The chart's drawing primitives, shared by the line and candle views (Tradash's grid, axis, watermark, level lines and
 * tags, and the capsule pill). Each takes the canvas context and the theme; nothing here keeps state.
 */
import type { CanvasOdometer } from "./canvas-odometer";
import { LABEL_RIGHT, LEVEL_STYLE, levelColour, NO_PINS, PAD_Y, textOn, PILL_H, PILL_H_POSITION, PILL_RIGHT, TAG_H, type ChartLevel, type ChartPins, type ChartTheme } from "./chart-style";
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

/** Half an axis label's height (the axis font is 11 px), for the room it needs clear of a tag. */
const LABEL_HALF = 6;

/**
 * How visible an axis label at `y` is beside the level tags drawn this frame (`rows`): gone where a tag covers it, back
 * to full 7 px clear of the nearest one. The tags and the labels share the right edge, and a tag over "$83,450.00"
 * left "$83,4" sticking out of it (the owner's terminal capture, 2026-10-14).
 */
export function labelAlphaBeside(y: number, rows: readonly TagRow[]): number {
  let alpha = 1;
  for (const r of rows) {
    const gap = Math.max(r.top - (y + LABEL_HALF), y - LABEL_HALF - r.bottom);
    alpha = Math.min(alpha, edgeAlpha(gap * 2));
  }
  return alpha;
}

/**
 * Tick marks on both edges (major 6 px, minor 3 px) and major labels at the right, fading near the edges, the pill and
 * the level tags (`avoid`: drawn first, so the labels make room for them rather than sitting under them).
 */
export function drawAxis(ctx: CanvasRenderingContext2D, theme: ChartTheme, win: YWindow, step: number, w: number, headY: number, pillH: number, avoid: readonly TagRow[] = []): void {
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
    ctx.globalAlpha = edge * edgeAlpha(Math.abs(y - headY) - (pillH / 2 + 4)) * labelAlphaBeside(y, avoid);
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

/**
 * A level's dashed line and axis tag, or, off-screen, a tag pinned 9 px inside the edge pointing the way. R4-0 (D-227):
 * `pins` move that edge clear of what floats over the canvas — on a phone the terminal's header (the equity pill hid
 * "▲ Line $…") and its controls row — and a level behind them counts as off-screen. Any tag steps past the tags already
 * drawn this frame (`taken`, which it joins): the Line and the Signed value sit dollars apart, and their tags hid each
 * other. A pinned tag also steps past the price pill (`pill`), which paints over it when a short chart puts the two on
 * one row: to the near side of what it meets while that still clears the pin, else to the far side.
 */
export function drawLevel(ctx: CanvasRenderingContext2D, theme: ChartTheme, level: ChartLevel, win: YWindow, plotW: number, w: number, tone: string, pins: ChartPins = NO_PINS, pill: TagRow | null = null, taken: TagRow[] = []): void {
  const style = LEVEL_STYLE[level.kind];
  const colour = levelColour(level.kind, theme, tone);
  const y = yOf(level.price, win);
  const h = win.bottom + PAD_Y;
  ctx.font = style.strong ? theme.tagStrongFont : theme.tagFont;
  // Behind a pin = its own tag (TAG_H tall, centred on the line) would not clear it by 2 px.
  const above = y < Math.max(win.top - 2, pins.top + TAG_H / 2 + 2);
  if (above || y > Math.min(win.bottom + 2, h - pins.bottom - TAG_H / 2 - 2)) {
    const text = `${above ? "▲" : "▼"} ${level.label} $${formatPrice(level.price)}`;
    ctx.font = theme.tagStrongFont;
    const tw = ctx.measureText(text).width + 10;
    ctx.globalAlpha = 0.9;
    const pinned = above ? Math.max(9, pins.top + 6) : h - Math.max(9, pins.bottom + 6) - TAG_H;
    // Toward its edge first (the near side of whatever it meets), else away from it.
    const at = clearRow(pinned, pill ? [...taken, pill] : taken, !above, pins.top + 2, h - pins.bottom - 2);
    taken.push({ top: at, bottom: at + TAG_H });
    tag(ctx, theme, text, w - LABEL_RIGHT - tw, at, tw, colour);
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
  // The dashed line stays at its price; only its tag steps aside, away from the tag it would cover.
  const own = y - TAG_H / 2;
  const hit = taken.find((r) => own < r.bottom + 2 && own + TAG_H > r.top - 2);
  const at = clearRow(own, taken, hit ? own >= hit.top : true, pins.top + 2, h - pins.bottom - 2);
  taken.push({ top: at, bottom: at + TAG_H });
  tag(ctx, theme, level.label, w - LABEL_RIGHT - tw, at, tw, colour);
}

/** A row the right edge already carries this frame: a level tag or the price pill (CSS px, top and bottom). */
export interface TagRow {
  top: number;
  bottom: number;
}

/**
 * Where a TAG_H-tall tag at `at` lands clear of `taken` (2 px apart): stepping past each row it meets toward `down`, or
 * the other way when that leaves [lo, hi]; if neither fits it keeps the first answer.
 */
export function clearRow(at: number, taken: readonly TagRow[], down: boolean, lo: number, hi: number): number {
  const walk = (dir: boolean) => {
    let y = at;
    for (let i = 0; i <= taken.length; i++) {
      const hit = taken.find((r) => y < r.bottom + 2 && y + TAG_H > r.top - 2);
      if (!hit) break;
      y = dir ? hit.bottom + 2 : hit.top - 2 - TAG_H;
    }
    return y;
  };
  const fits = (y: number) => y >= lo && y + TAG_H <= hi;
  const first = walk(down);
  if (fits(first)) return first;
  const other = walk(!down);
  return fits(other) ? other : first;
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
