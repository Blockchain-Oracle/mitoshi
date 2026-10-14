// Ported from Owarine ecb7565b:web/src/features/terminal/chart/chart-engine.ts — Mitoshi's tokens and levels; a flat
// chart may carry an overlay with no PnL (the Line and the signed tick), drawn without the pill's PnL row.
/**
 * The live chart, to Tradash's renderer (canton-season3 context/13-revamp/tradash/SPEC-chart.md §§2–4), drawn with
 * Mitoshi's chart tokens (DESIGN.md chart map).
 *
 * Line view, each animation frame: ease the price toward the latest tick and push it into the 600-sample ring (fixed
 * 60 Hz sample clock), centre the y-axis on the eased price at ±7.5 frozen steps, then draw in Tradash's order — grid,
 * PnL band, glow + line, left fade, watermark, axis, level lines and tags, head dot, and the pill whose digits roll.
 * Candle view (`candle-view.ts`): the same grid, axis, levels and pill around batched candles and a dashed live-price
 * line. Switching views crossfades the canvas (out 0.35 a frame, swap, in 0.2). Colour is the up line unless an open
 * position is losing.
 */
import { CanvasOdometer } from "./canvas-odometer";
import { drawAxis, drawGrid, drawLevel, drawPill, drawWaiting, drawWatermark, type TagRow } from "./chart-draw";
import { MIN_PLOT_LEFTOVER, NO_PINS, PAD_Y, PILL_GAP, PILL_H, PILL_H_POSITION, PILL_RIGHT, withAlpha, type ChartOverlay, type ChartPins, type ChartTheme, type ChartView, type FrameInfo } from "./chart-style";
import { catmullRom, easeFor, FADE_FRACTION, formatUsd, PRICE_EASE, priceDecimals, SAMPLE_CAPACITY, SAMPLE_MS, SampleRing, SPAN_STEPS, stepFor, yOf, type YWindow } from "./engine";
import type { CandleView } from "./candle-view";

export type { ChartLevel, ChartOverlay, ChartTheme, FrameInfo, LevelKind } from "./chart-style";

const MAX_SAMPLES_PER_FRAME = 8;
const VIEW_SWAP_TIMEOUT_MS = 2_500;

export class ChartEngine {
  private ctx: CanvasRenderingContext2D;
  private ring = new SampleRing(SAMPLE_CAPACITY);
  private target: number | null = null;
  private latest: number | null = null;
  private eased = 0;
  private step = 0;
  private overlay: ChartOverlay | null = null;
  private priceOdo = new CanvasOdometer();
  private pnlOdo = new CanvasOdometer();
  private lastFrame = 0;
  private sampleDebt = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private xs = new Float64Array(SAMPLE_CAPACITY);
  private ys = new Float64Array(SAMPLE_CAPACITY);
  private candles: CandleView | null = null;
  private pending: { view: ChartView; candles: CandleView | null; since: number } | null = null;
  private opacity = 1;
  private lastGeom: { plotW: number; win: YWindow | null } = { plotW: 0, win: null };
  private pins: ChartPins = NO_PINS;

  constructor(private canvas: HTMLCanvasElement, private theme: ChartTheme, private label: string) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
  }

  setTheme(theme: ChartTheme): void {
    this.theme = theme;
  }

  /** Every tick, unthrottled. The first tick seeds a flat line at it. */
  setPrice(price: number): void {
    if (!(price > 0) || !Number.isFinite(price)) return;
    this.latest = price;
    if (this.target === null) {
      this.target = price;
      this.eased = price;
      this.step = stepFor(price);
      this.ring.fill(price);
      return;
    }
    this.target = price;
  }

  /** What floats over the canvas, top and bottom; off-screen level tags pin clear of it. */
  setPins(pins: ChartPins): void {
    this.pins = pins;
  }

  setOverlay(overlay: ChartOverlay | null): void {
    if ((overlay?.pnl == null) !== (this.overlay?.pnl == null)) this.pnlOdo.reset();
    this.overlay = overlay;
  }

  /** Line, or candles on a view the caller built; the canvas fades out, swaps, and fades back in. */
  setView(view: ChartView, candles: CandleView | null): void {
    const showing = this.pending ? this.pending.candles : this.candles;
    if (view === "line" ? showing === null : showing === candles) return;
    this.pending = { view, candles: view === "line" ? null : candles, since: performance.now() };
  }

  /** What the candle gestures need: the plot width and y window of the last frame. */
  geometry(): { plotW: number; win: YWindow | null } {
    return this.lastGeom;
  }

  get view(): ChartView {
    return this.candles ? "candles" : "line";
  }

  /** A new symbol: forget the line, the scale and the digits; the next tick starts a flat line. */
  reset(label: string): void {
    this.label = label;
    this.ring.clear();
    this.target = null;
    this.latest = null;
    this.step = 0;
    this.priceOdo.reset();
    this.pnlOdo.reset();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
  }

  private crossfade(): void {
    const p = this.pending;
    if (p) {
      const ready = p.view === "line" || (p.candles?.series.count ?? 0) > 0 || performance.now() - p.since > VIEW_SWAP_TIMEOUT_MS;
      if (ready) this.opacity += (0 - this.opacity) * 0.35;
      if (this.opacity < 0.04) {
        this.candles = p.view === "candles" ? p.candles : null;
        this.pending = null;
      }
    } else if (this.opacity < 1) this.opacity = this.opacity > 0.99 ? 1 : this.opacity + (1 - this.opacity) * 0.2;
    const css = String(Math.round(this.opacity * 1000) / 1000);
    if (this.canvas.style.opacity !== css) this.canvas.style.opacity = css;
  }

  /** One animation frame; returns what the parallax grid and the reaction overlay follow, or null before the first tick. */
  frame(nowMs: number): FrameInfo | null {
    const dt = this.lastFrame === 0 ? SAMPLE_MS : Math.min(250, nowMs - this.lastFrame);
    this.lastFrame = nowMs;
    const { ctx, width: w, height: h, theme } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.crossfade();
    if (this.target === null || this.latest === null || w < 40 || h < 40) {
      drawWaiting(ctx, theme, this.candles?.unavailable ?? `Waiting for ${this.label}…`, w, h);
      return null;
    }

    // Ease and sample on a fixed 60 Hz clock, whatever the display's rate.
    const before = this.eased;
    this.sampleDebt += dt / SAMPLE_MS;
    let pushes = Math.min(MAX_SAMPLES_PER_FRAME, Math.floor(this.sampleDebt));
    this.sampleDebt -= Math.floor(this.sampleDebt);
    const k = easeFor(PRICE_EASE, SAMPLE_MS);
    while (pushes-- > 0) {
      const d = this.target - this.eased;
      this.eased = Math.abs(d) < 1e-7 * Math.abs(this.eased) ? this.target : this.eased + d * k;
      this.ring.push(this.eased);
    }

    const overlay = this.overlay;
    const withPnl = overlay !== null && overlay.pnl !== null;
    const tone = !withPnl || overlay!.pnl! >= 0 ? theme.up : theme.down;
    // Pill text and width first: the plot ends 10 px left of it.
    const priceText = formatUsd(this.latest, priceDecimals(this.latest));
    this.priceOdo.set(priceText, this.latest);
    if (withPnl) this.pnlOdo.set(overlay!.pnlText, overlay!.pnl!);
    this.priceOdo.step(dt);
    this.pnlOdo.step(dt);
    ctx.font = theme.pillFont;
    let pillTextW = ctx.measureText("0").width * priceText.length;
    if (withPnl) {
      ctx.font = theme.pillPnlFont;
      pillTextW = Math.max(pillTextW, ctx.measureText(overlay!.pnlText).width);
    }
    const pillW = pillTextW + 18;
    const plotW = Math.min(w - PILL_RIGHT - pillW - PILL_GAP, w - MIN_PLOT_LEFTOVER);
    const pillH = withPnl ? PILL_H_POSITION : PILL_H;
    const info = this.candles ? this.drawCandles(plotW, tone) : this.drawLine(plotW, tone);
    // Where drawPill puts the pill, so a pinned level tag can step past it.
    const pillTop = Math.min(h - pillH - 2, Math.max(2, info.headY - pillH / 2));
    const taken: TagRow[] = [];
    if (overlay) for (const level of overlay.levels) drawLevel(ctx, theme, level, info.win, plotW, w, tone, this.pins, { top: pillTop, bottom: pillTop + pillH }, taken);
    // The axis after the tags: its labels make room for them instead of sitting half under them.
    drawAxis(ctx, theme, info.win, info.step, w, info.headY, pillH, taken);
    if (this.candles) this.candles.drawCrosshair(ctx, theme, info.win, info.step, plotW, w);
    drawPill(ctx, theme, w, h, info.headY, pillW, tone, this.priceOdo, withPnl ? this.pnlOdo : null);
    this.lastGeom = { plotW, win: info.win };
    return { price: this.eased, velocitySteps: this.step > 0 ? (this.eased - before) / this.step : 0, scrollX: info.scrollX, headX: info.headX, headY: info.headY };
  }

  private drawLine(plotW: number, tone: string): { win: YWindow; step: number; headX: number; headY: number; scrollX: number } {
    const { ctx, theme, height: h } = this;
    const win: YWindow = { center: this.eased, half: (SPAN_STEPS * this.step) / 2, top: PAD_Y, bottom: h - PAD_Y };
    const n = this.ring.length;
    for (let i = 0; i < n; i++) {
      this.xs[i] = (i / (n - 1)) * plotW;
      this.ys[i] = yOf(this.ring.at(i), win);
    }
    const headY = this.ys[n - 1]!;
    drawGrid(ctx, theme, win, this.step, plotW);
    const path = new Path2D();
    path.moveTo(this.xs[0]!, this.ys[0]!);
    for (let i = 0; i < n - 1; i++) {
      const [c1x, c1y, c2x, c2y] = catmullRom(this.xs, this.ys, i);
      path.bezierCurveTo(c1x, c1y, c2x, c2y, this.xs[i + 1]!, this.ys[i + 1]!);
    }
    // The PnL band: the path closed to the entry line, strongest at the price side.
    const overlay = this.overlay;
    if (overlay && overlay.entry !== null) {
      const entryY = yOf(overlay.entry, win);
      const band = new Path2D(path);
      band.lineTo(plotW, entryY);
      band.lineTo(0, entryY);
      band.closePath();
      this.fillBand(band, headY, entryY, tone);
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = tone;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 6;
    ctx.stroke(path);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.stroke(path);
    // The tail dissolves: erase the left 32 % with a gradient.
    const fadeW = plotW * FADE_FRACTION;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    const fade = ctx.createLinearGradient(0, 0, fadeW, 0);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(0.45, "rgba(0,0,0,0.55)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, fadeW, h);
    ctx.restore();
    drawWatermark(ctx, theme, plotW, h);
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.arc(plotW, headY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    return { win, step: this.step, headX: plotW, headY, scrollX: plotW / (SAMPLE_CAPACITY - 1) };
  }

  private drawCandles(plotW: number, tone: string): { win: YWindow; step: number; headX: number; headY: number; scrollX: number } {
    const { ctx, theme, height: h } = this;
    const view = this.candles!;
    view.series.update(this.latest!, this.eased, Date.now());
    const { win, step } = view.window(plotW, PAD_Y, h - PAD_Y, this.eased);
    const liveY = Math.min(win.bottom, Math.max(win.top, yOf(this.latest!, win)));
    drawGrid(ctx, theme, win, step, plotW);
    const overlay = this.overlay;
    if (overlay && overlay.entry !== null) {
      const entryY = yOf(overlay.entry, win);
      const band = new Path2D();
      band.rect(0, Math.min(entryY, liveY), plotW, Math.abs(entryY - liveY));
      this.fillBand(band, liveY, entryY, tone);
    }
    const slideBefore = view.series.slide;
    view.draw(ctx, theme, win, plotW);
    drawWatermark(ctx, theme, plotW, h);
    ctx.save();
    ctx.strokeStyle = tone;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, Math.round(liveY) + 0.5);
    ctx.lineTo(plotW, Math.round(liveY) + 0.5);
    ctx.stroke();
    ctx.restore();
    return { win, step, headX: plotW, headY: liveY, scrollX: (slideBefore - view.series.slide) * (view.spacing ?? 8) };
  }

  private fillBand(band: Path2D, fromY: number, toY: number, tone: string): void {
    const { ctx } = this;
    const g = ctx.createLinearGradient(0, fromY, 0, toY === fromY ? fromY + 1 : toY);
    g.addColorStop(0, withAlpha(ctx, tone, 0.22));
    g.addColorStop(1, withAlpha(ctx, tone, 0.02));
    ctx.fillStyle = g;
    ctx.fill(band);
  }
}
