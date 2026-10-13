// Ported from Owarine 90a91d71:web/src/features/markets/chart/draw.ts (O-3, D-222)
/**
 * The Window chart's painter. One call draws one frame from a `Frame` the component has already laid out: dot field,
 * price grid, the time left, the Window's open and close, the reference line, the fill and line (green above the
 * opening print, red below), the live head, the axis pill and tag, the time axis and the hover read-out.
 *
 * Every colour and font comes from the `--ow-*` tokens (`ChartPalette`); nothing here keeps state.
 */
import type { CanvasOdometer } from "@/features/terminal/chart/canvas-odometer";
import { withAlpha } from "@/features/terminal/chart/chart-style";
import { clearance, monotoneTangents, tagY } from "./model";

export interface ChartPalette {
  ink: string;
  muted: string;
  helper: string;
  hairline: string;
  card: string;
  up: string;
  down: string;
  upText: string;
  downText: string;
  onLine: string;
  inverse: string;
  axisFont: string;
  pillFont: string;
  tagFont: string;
  tagStrongFont: string;
}

export interface Plot {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Frame {
  w: number;
  h: number;
  plot: Plot;
  /** Decimated points, already in CSS px; the live head is the last one. */
  xs: Float64Array;
  ys: Float64Array;
  n: number;
  head: { x: number; y: number; text: string; value: number; live: boolean } | null;
  reference: { y: number; text: string; label: string } | null;
  /** Price grid lines: y and text. */
  grid: Array<{ y: number; text: string }>;
  /** Time grid: x and text. */
  times: Array<{ x: number; text: string }>;
  window: { openX: number | null; closeX: number | null; openLabel: string; closeLabel: string } | null;
  nowX: number | null;
  hover: { x: number; y: number; lines: Array<{ text: string; tone: "ink" | "up" | "down" | "muted" }> } | null;
  /** 0..1 through the head's pulse; null holds it still (reduced motion, or not live). */
  pulse: number | null;
  compact: boolean;
}

export const PILL_H = 26;
export const TAG_H = 18;
const DOT_SPACING = 28;
const PILL_PAD_X = 10;

const tone = (pal: ChartPalette, t: "ink" | "up" | "down" | "muted") => (t === "up" ? pal.upText : t === "down" ? pal.downText : t === "muted" ? pal.muted : pal.ink);

function dots(ctx: CanvasRenderingContext2D, pal: ChartPalette, f: Frame): void {
  ctx.fillStyle = pal.hairline;
  ctx.beginPath();
  for (let x = f.plot.left + DOT_SPACING / 2; x < f.plot.right; x += DOT_SPACING)
    for (let y = f.plot.top + DOT_SPACING / 2; y < f.plot.bottom; y += DOT_SPACING) {
      ctx.moveTo(x + 1, y);
      ctx.arc(x, y, 1, 0, Math.PI * 2);
    }
  ctx.fill();
}

function hline(ctx: CanvasRenderingContext2D, y: number, x0: number, x1: number): void {
  const yy = Math.round(y) + 0.5;
  ctx.beginPath();
  ctx.moveTo(x0, yy);
  ctx.lineTo(x1, yy);
  ctx.stroke();
}

function vline(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number): void {
  const xx = Math.round(x) + 0.5;
  ctx.beginPath();
  ctx.moveTo(xx, y0);
  ctx.lineTo(xx, y1);
  ctx.stroke();
}

/** The curve through the points (monotone, so it never overshoots a print), as a path on `ctx`. */
function tracePath(ctx: CanvasRenderingContext2D, f: Frame): void {
  const { xs, ys, n } = f;
  ctx.moveTo(xs[0]!, ys[0]!);
  if (n > f.plot.right - f.plot.left) {
    // Denser than a point per pixel: straight segments are already smooth, and cheaper.
    for (let i = 1; i < n; i++) ctx.lineTo(xs[i]!, ys[i]!);
    return;
  }
  const m = monotoneTangents(xs, ys, n);
  for (let i = 0; i < n - 1; i++) {
    const dx = (xs[i + 1]! - xs[i]!) / 3;
    ctx.bezierCurveTo(xs[i]! + dx, ys[i]! + m[i]! * dx, xs[i + 1]! - dx, ys[i + 1]! - m[i + 1]! * dx, xs[i + 1]!, ys[i + 1]!);
  }
}

/** The fill under (or over) the line toward `baseY`, fading away from the line, then the line itself. */
function lineAndFill(ctx: CanvasRenderingContext2D, f: Frame, colour: string, baseY: number, clip: [number, number] | null): void {
  if (f.n < 2) return;
  ctx.save();
  // The run-in point sits left of the plot: the line enters from the edge rather than being pinned to it.
  ctx.beginPath();
  ctx.rect(f.plot.left, clip ? clip[0] : 0, f.plot.right - f.plot.left, clip ? clip[1] - clip[0] : f.h);
  ctx.clip();
  const first = f.xs[0]!;
  const last = f.xs[f.n - 1]!;
  const far = clip ? (clip[0] < baseY ? f.plot.top : f.plot.bottom) : f.plot.top;
  const grad = ctx.createLinearGradient(0, far, 0, baseY);
  // A side colour washes strongly; plain ink (no print yet) only hints, or it reads as a grey block.
  grad.addColorStop(0, withAlpha(ctx, colour, clip ? 0.22 : 0.07));
  grad.addColorStop(1, withAlpha(ctx, colour, 0.02));
  ctx.beginPath();
  tracePath(ctx, f);
  ctx.lineTo(last, baseY);
  ctx.lineTo(first, baseY);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  tracePath(ctx, f);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = withAlpha(ctx, colour, 0.18);
  ctx.lineWidth = f.compact ? 4 : 6;
  ctx.stroke();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function capsule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke: string | null): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export function drawFrame(ctx: CanvasRenderingContext2D, pal: ChartPalette, f: Frame, odometer: CanvasOdometer): void {
  const { plot } = f;
  ctx.clearRect(0, 0, f.w, f.h);
  if (!f.compact) dots(ctx, pal, f);

  // The time still to run in the Window: a quiet wash from now to the close.
  if (f.window?.closeX != null && f.nowX !== null && f.nowX < f.window.closeX) {
    ctx.fillStyle = withAlpha(ctx, pal.ink, 0.035);
    ctx.fillRect(Math.max(plot.left, f.nowX), plot.top, Math.min(plot.right, f.window.closeX) - Math.max(plot.left, f.nowX), plot.bottom - plot.top);
  }

  // Price grid: dashed hairlines, labels in the gutter that step aside for the pill and the reference tag.
  ctx.font = pal.axisFont;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const pillY = f.head ? Math.min(plot.bottom - PILL_H / 2, Math.max(plot.top + PILL_H / 2, f.head.y)) : null;
  const refTagY = f.reference ? tagY(f.reference.y, pillY, TAG_H, PILL_H, plot.top, plot.bottom) : null;
  for (const g of f.grid) {
    ctx.strokeStyle = pal.hairline;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    hline(ctx, g.y, plot.left, plot.right);
    ctx.setLineDash([]);
    if (f.compact) continue;
    const away = Math.min(pillY === null ? 99 : clearance(Math.abs(g.y - pillY), PILL_H / 2 + 6), refTagY === null ? 99 : clearance(Math.abs(g.y - refTagY), TAG_H / 2 + 6), 1);
    if (away <= 0) continue;
    ctx.globalAlpha = away;
    ctx.fillStyle = pal.helper;
    ctx.fillText(g.text, plot.right + 10, g.y);
    ctx.globalAlpha = 1;
  }

  // The Window's open and close: thin verticals with their word at the top.
  if (f.window) {
    ctx.font = pal.tagFont;
    ctx.textBaseline = "top";
    for (const [x, label, strong] of [
      [f.window.openX, f.window.openLabel, false],
      [f.window.closeX, f.window.closeLabel, true],
    ] as const) {
      if (x === null || x < plot.left || x > plot.right) continue;
      ctx.strokeStyle = withAlpha(ctx, pal.ink, strong ? 0.45 : 0.22);
      ctx.lineWidth = 1;
      ctx.setLineDash(strong ? [] : [3, 3]);
      vline(ctx, x, plot.top, plot.bottom);
      ctx.setLineDash([]);
      if (f.compact) continue;
      // The word sits right of its line, else left, and only where it fits inside the plot (R4-0, D-227: a narrow panel
      // right-aligned OPEN past the left edge and it read "PEN").
      const tw = ctx.measureText(label).width;
      const rightOk = x + 6 + tw <= plot.right;
      const leftOk = x - 6 - tw >= plot.left;
      if (!rightOk && !leftOk) continue;
      ctx.fillStyle = pal.muted;
      ctx.textAlign = rightOk ? "left" : "right";
      ctx.fillText(label, rightOk ? x + 6 : x - 6, plot.top + 4);
    }
  }

  // The reference (opening print): a dashed rule across the plot.
  const refY = f.reference?.y ?? null;
  if (refY !== null) {
    ctx.strokeStyle = withAlpha(ctx, pal.ink, 0.55);
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    hline(ctx, refY, plot.left, plot.right);
    ctx.setLineDash([]);
  }

  // The line: green above the print, red below; ink when there is no print to measure against.
  if (refY !== null) {
    lineAndFill(ctx, f, pal.up, refY, [plot.top - 8, refY]);
    lineAndFill(ctx, f, pal.down, refY, [refY, plot.bottom + 8]);
  } else lineAndFill(ctx, f, pal.ink, plot.bottom, null);

  const headColour = f.head && refY !== null ? (f.head.y <= refY ? pal.up : pal.down) : pal.ink;

  // The head: a guide to the axis, the pulse, the dot.
  if (f.head) {
    const { x, y } = f.head;
    ctx.strokeStyle = withAlpha(ctx, headColour, 0.45);
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 3]);
    hline(ctx, y, x, plot.right);
    ctx.setLineDash([]);
    if (f.pulse !== null) {
      ctx.beginPath();
      ctx.arc(x, y, 4 + 12 * f.pulse, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(ctx, headColour, 0.3 * (1 - f.pulse));
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = headColour;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.card;
    ctx.stroke();
  }

  // The reference tag on the axis, and its word at the left of the rule.
  if (f.reference && refTagY !== null) {
    ctx.font = pal.tagStrongFont;
    const tw = ctx.measureText(f.reference.text).width + 14;
    const x = Math.min(f.w - tw - 2, plot.right + 4);
    capsule(ctx, x, refTagY - TAG_H / 2, tw, TAG_H, pal.ink, null);
    ctx.fillStyle = pal.inverse;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(f.reference.text, x + 7, refTagY + 0.5);
    if (!f.compact && refY !== null) {
      ctx.font = pal.tagFont;
      const label = f.reference.label.toUpperCase();
      const lw = ctx.measureText(label).width + 12;
      const above = refY - TAG_H - 4 > plot.top;
      const ly = above ? refY - TAG_H - 3 : refY + 3;
      capsule(ctx, plot.left + 6, ly, lw, TAG_H, pal.card, pal.hairline);
      ctx.fillStyle = pal.ink;
      ctx.fillText(label, plot.left + 12, ly + TAG_H / 2 + 0.5);
    }
  }

  // The live pill: the price rolling, in the side that is winning.
  if (f.head && pillY !== null) {
    ctx.font = pal.pillFont;
    odometer.set(f.head.text, f.head.value);
    const pw = odometer.measure(ctx) + 2 * PILL_PAD_X;
    const x = Math.min(f.w - pw - 2, plot.right + 4);
    capsule(ctx, x, pillY - PILL_H / 2, pw, PILL_H, headColour, null);
    ctx.fillStyle = headColour === pal.ink ? pal.inverse : pal.onLine;
    odometer.draw(ctx, x + pw - PILL_PAD_X, pillY + 0.5, 18, pillY - PILL_H / 2, pillY + PILL_H / 2);
  }

  // Time axis.
  if (!f.compact) {
    ctx.font = pal.axisFont;
    ctx.fillStyle = pal.helper;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    for (const t of f.times) {
      if (t.x < plot.left + 18 || t.x > plot.right - 18) continue;
      ctx.fillText(t.text, t.x, plot.bottom + 8);
    }
  }

  if (f.hover) hover(ctx, pal, f, f.hover);
}

function hover(ctx: CanvasRenderingContext2D, pal: ChartPalette, f: Frame, h: NonNullable<Frame["hover"]>): void {
  const { plot } = f;
  ctx.strokeStyle = withAlpha(ctx, pal.ink, 0.35);
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  vline(ctx, h.x, plot.top, plot.bottom);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(h.x, h.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = pal.card;
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = pal.tagStrongFont;
  const lineH = 16;
  const bw = Math.max(...h.lines.map((l) => ctx.measureText(l.text).width)) + 20;
  const bh = h.lines.length * lineH + 12;
  const bx = h.x + 12 + bw > plot.right ? h.x - 12 - bw : h.x + 12;
  const by = Math.min(plot.bottom - bh, Math.max(plot.top, h.y - bh - 10 < plot.top ? h.y + 10 : h.y - bh - 10));
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 10);
  ctx.fillStyle = pal.card;
  ctx.fill();
  ctx.strokeStyle = pal.hairline;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  h.lines.forEach((l, i) => {
    ctx.fillStyle = tone(pal, l.tone);
    ctx.fillText(l.text, bx + 10, by + 6 + lineH * i + lineH / 2);
  });
}
