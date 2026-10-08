// Ported from Owarine ecb7565b:web/src/features/terminal/chart/dot-grid.ts — unchanged.
/**
 * The parallax dot field behind the chart (Tradash's `DotGrid`): dots every 34 px, scrolling left at half the line's
 * sample speed and drifting with the price's motion. The drift is measured in grid steps, not price units, so BTC and a
 * $1 asset move it alike (the reference's raw-dollar drift pins at its clamp on BTC).
 */
import type { FrameInfo } from "./chart-engine";

const SPACING = 34;
const RADIUS = 1.1;
const DRIFT_GAIN = 4;
const DRIFT_CLAMP = 6;
const DRIFT_EASE = 0.06;

export class DotGrid {
  private ctx: CanvasRenderingContext2D;
  private offsetX = 0;
  private targetY = 0;
  private offsetY = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement, private colour: string) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
  }

  setColour(colour: string): void {
    this.colour = colour;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
  }

  /** Follows one chart frame (or holds still when the chart has no price yet). */
  frame(info: FrameInfo | null, reduced: boolean): void {
    if (info && !reduced) {
      this.offsetX = (this.offsetX - 0.5 * info.scrollX) % SPACING;
      this.targetY += Math.max(-DRIFT_CLAMP, Math.min(DRIFT_CLAMP, DRIFT_GAIN * info.velocitySteps * SPACING));
      this.targetY %= SPACING * 1000;
      this.offsetY += (this.targetY - this.offsetY) * DRIFT_EASE;
    }
    const { ctx, width: w, height: h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.colour;
    const ox = ((this.offsetX % SPACING) + SPACING) % SPACING;
    const oy = ((this.offsetY % SPACING) + SPACING) % SPACING;
    ctx.beginPath();
    for (let x = ox - SPACING; x < w + SPACING; x += SPACING) {
      for (let y = oy - SPACING; y < h + SPACING; y += SPACING) {
        ctx.moveTo(x + RADIUS, y);
        ctx.arc(x, y, RADIUS, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }
}
