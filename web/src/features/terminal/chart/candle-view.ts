// Ported from Owarine ecb7565b:web/src/features/terminal/chart/candle-view.ts — Mitoshi's ops route (`endMs`), the
// source each read names (`coinbase`, `bitstamp`, `alpaca`, `redstone`) kept for the chart's label.
/**
 * The candle view, to Tradash's (`CandleSeries` + `CandleViewport` + `CandleGestures`; SPEC-chart.md §4): 300 candles
 * from ops `/prices/candles`, the last three re-read at each boundary + 4 s, older history fetched as the view nears it,
 * a full reload when the tab returns; pan, pinch, wheel, axis-drag y-scale, a tap crosshair snapping to candle × step/5
 * detents (with a haptic tick), double-tap to recentre (lerp 0.2 a frame). Drawn in four batched paths.
 */
import { formatPrice, niceStep, yOf, type YWindow } from "./engine";
import type { ChartTheme } from "./chart-style";
import { bodyWidth, candleStep, CandleSeries, defaultSpacing, detent, INTERVAL_MS, slotX, SPACING_MAX, SPACING_MIN, visibleRange, type Candle, type CandleInterval } from "./candles";

const INITIAL = 300;
const REFRESH_COUNT = 3;
const REFRESH_AFTER_BOUNDARY_MS = 4_000;
const RETRY_MS = 3_000;
const OLDER_WITHIN = 20;
const TAP_MS = 300;
const TAP_PX = 6;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 24;

export interface CandleGeometry {
  plotW: number;
  win: YWindow | null;
}

export class CandleView {
  readonly series: CandleSeries;
  spacing: number | null = null;
  offset = 0;
  free: { center: number; half: number } | null = null;
  crosshair: { x: number; y: number } | null = null;
  unavailable: string | null = null;
  /** Where the last read came from (ops names it); the chart says so when it isn't an exchange. */
  source: string | null = null;
  private step: number | null = null;
  private recentering = false;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private olderAsked = new Set<number>();
  private stopped = false;
  private lastDetent = "";

  constructor(private symbol: string, readonly interval: CandleInterval, private base: string | null, private onDetent: () => void) {
    this.series = new CandleSeries(INTERVAL_MS[interval]);
  }

  start(): () => void {
    void this.load(INITIAL);
    const onVisible = () => {
      if (document.visibilityState === "visible") void this.load(INITIAL);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      this.stopped = true;
      this.timers.forEach(clearTimeout);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }

  private async fetchRows(count: number, endMs?: number): Promise<Candle[] | null> {
    if (!this.base) return null;
    const url = `${this.base}/prices/candles?symbol=${encodeURIComponent(this.symbol)}&interval=${this.interval}&count=${count}${endMs ? `&endMs=${endMs}` : ""}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) {
      const b = (await res.json().catch(() => ({}))) as { reason?: string };
      this.unavailable = b.reason ?? `Candles for ${this.symbol} are not available yet`;
      return null;
    }
    if (!res.ok) throw new Error(`candles HTTP ${res.status}`);
    const b = (await res.json()) as { source?: string; candles?: Array<[number, number, number, number, number]> };
    if (typeof b.source === "string") this.source = b.source;
    return (b.candles ?? []).map(([t, o, h, l, c]) => ({ t, o, h, l, c }));
  }

  private async load(count: number): Promise<void> {
    try {
      const rows = await this.fetchRows(count);
      if (this.stopped || rows === null) return;
      this.series.merge(rows, Date.now());
      this.arm();
    } catch {
      if (!this.stopped) this.timers.push(setTimeout(() => void this.load(count), RETRY_MS));
    }
  }

  /** The next refresh: at the next boundary + 4 s, the last three candles. */
  private arm(): void {
    const ms = INTERVAL_MS[this.interval];
    const wait = Math.ceil(Date.now() / ms) * ms + REFRESH_AFTER_BOUNDARY_MS - Date.now();
    this.timers.push(setTimeout(() => void this.load(REFRESH_COUNT), wait));
  }

  private async older(): Promise<void> {
    const oldest = this.series.oldestT;
    if (oldest === null || this.olderAsked.has(oldest)) return;
    this.olderAsked.add(oldest);
    try {
      const rows = await this.fetchRows(INITIAL, oldest - 1);
      if (rows && !this.stopped) this.series.merge(rows, Date.now());
    } catch {
      this.olderAsked.delete(oldest);
    }
  }

  /** The visible y window: centred on the live price at ±7.5 auto steps, or the free window after a pan or axis drag. */
  window(plotW: number, top: number, bottom: number, price: number): { win: YWindow; step: number } {
    const spacing = this.spacing ?? defaultSpacing(plotW);
    if (this.step === null || this.series.closed.length < 2) {
      const { from, to } = visibleRange(plotW, spacing, this.offset);
      const bodies: Candle[] = [];
      for (let k = from; k <= to; k++) {
        const c = this.series.at(k);
        if (c) bodies.push(c);
      }
      this.step = bodies.length ? candleStep(bodies, price, niceStep) : niceStep(1e-4 * price);
    }
    const auto = { center: price, half: 7.5 * this.step };
    if (this.recentering) {
      this.offset += (0 - this.offset) * 0.2;
      if (this.free) {
        this.free = { center: this.free.center + (auto.center - this.free.center) * 0.2, half: this.free.half + (auto.half - this.free.half) * 0.2 };
        if (Math.abs(this.free.half - auto.half) < auto.half * 0.002 && Math.abs(this.free.center - auto.center) < auto.half * 0.002) this.free = null;
      }
      if (Math.abs(this.offset) < 0.02 && !this.free) {
        this.offset = 0;
        this.recentering = false;
      }
    }
    const y = this.free ?? auto;
    return { win: { center: y.center, half: y.half, top, bottom }, step: niceStep((2 * y.half) / 15) };
  }

  get offCentre(): boolean {
    return Math.abs(this.offset) > 0.5 || this.free !== null;
  }

  recentre(): void {
    this.recentering = true;
    this.crosshair = null;
  }

  /** Bodies and wicks, batched by direction; the forming candle slides in after a rollover. */
  draw(ctx: CanvasRenderingContext2D, theme: ChartTheme, win: YWindow, plotW: number): void {
    const spacing = this.spacing ?? defaultSpacing(plotW);
    const { from, to } = visibleRange(plotW, spacing, this.offset);
    if (to >= this.series.count - OLDER_WITHIN) void this.older();
    const bw = bodyWidth(spacing);
    const paths = { upBody: new Path2D(), downBody: new Path2D(), upWick: new Path2D(), downWick: new Path2D() };
    for (let k = from; k <= to; k++) {
      const c = this.series.at(k);
      if (!c) continue;
      const x = slotX(k, plotW, spacing, this.offset, this.series.slide);
      if (x < -spacing || x > plotW + spacing) continue;
      const up = c.c >= c.o;
      const yo = yOf(c.o, win);
      const yc = yOf(c.c, win);
      const xr = Math.round(x) + 0.5;
      (up ? paths.upWick : paths.downWick).moveTo(xr, yOf(c.h, win));
      (up ? paths.upWick : paths.downWick).lineTo(xr, yOf(c.l, win));
      (up ? paths.upBody : paths.downBody).rect(Math.round(x - bw / 2), Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, plotW, ctx.canvas.height);
    ctx.clip();
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.up;
    ctx.stroke(paths.upWick);
    ctx.strokeStyle = theme.down;
    ctx.stroke(paths.downWick);
    ctx.fillStyle = theme.up;
    ctx.fill(paths.upBody);
    ctx.fillStyle = theme.down;
    ctx.fill(paths.downBody);
    ctx.restore();
    this.series.decay();
  }

  /** The crosshair: dashed lines, a dot, and the price capsule at the axis. */
  drawCrosshair(ctx: CanvasRenderingContext2D, theme: ChartTheme, win: YWindow, step: number, plotW: number, w: number): void {
    if (!this.crosshair) return;
    const spacing = this.spacing ?? defaultSpacing(plotW);
    const priceAt = (y: number) => win.center + ((win.top + win.bottom) / 2 - y) / ((win.bottom - win.top) / 2) * win.half;
    const d = detent(this.crosshair.x, this.crosshair.y, plotW, spacing, this.offset, this.series.slide, priceAt, step);
    const key = `${d.k}:${d.price}`;
    if (key !== this.lastDetent) {
      if (this.lastDetent) this.onDetent();
      this.lastDetent = key;
    }
    const x = slotX(d.k, plotW, spacing, this.offset, this.series.slide);
    const y = yOf(d.price, win);
    ctx.save();
    ctx.strokeStyle = theme.ink;
    ctx.globalAlpha = 0.75;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, win.top - 20);
    ctx.lineTo(x, win.bottom + 20);
    ctx.moveTo(0, y);
    ctx.lineTo(plotW, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = theme.ink;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    const text = `$${formatPrice(d.price)}`;
    ctx.font = theme.pillPriceFont;
    const tw = ctx.measureText(text).width + 16;
    ctx.beginPath();
    ctx.roundRect(w - 14 - tw, y - 11, tw, 22, 11);
    ctx.fill();
    ctx.fillStyle = theme.inverse;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w - 14 - tw + 8, y + 0.5);
  }

  /** Pointer and wheel gestures on the canvas; `geom` reads the current plot. Returns the detach. */
  attach(canvas: HTMLCanvasElement, geom: () => CandleGeometry): () => void {
    const pointers = new Map<number, { x: number; y: number; startX: number; startY: number; at: number }>();
    let pinch: { dist: number; spacing: number } | null = null;
    let lastTap = { at: 0, x: 0, y: 0 };
    let axisDrag = false;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const spacingOf = (plotW: number) => this.spacing ?? defaultSpacing(plotW);
    const freeFrom = (win: YWindow | null) => this.free ?? (win ? { center: win.center, half: win.half } : null);
    const clampOffset = (plotW: number) => {
      const slots = plotW / spacingOf(plotW);
      this.offset = Math.min(Math.max(this.offset, -0.6 * slots), Math.max(0, this.series.count - 3));
    };

    const down = (e: PointerEvent) => {
      const p = local(e);
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { ...p, startX: p.x, startY: p.y, at: performance.now() });
      axisDrag = pointers.size === 1 && p.x > geom().plotW;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), spacing: spacingOf(geom().plotW) };
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (this.crosshair && e.pointerType === "mouse") this.crosshair = local(e);
        return;
      }
      const p = local(e);
      const { plotW, win } = geom();
      if (pointers.size === 2 && pinch) {
        pointers.set(e.pointerId, { ...prev, ...p });
        const [a, b] = [...pointers.values()];
        this.spacing = Math.min(SPACING_MAX, Math.max(SPACING_MIN, pinch.spacing * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / (pinch.dist || 1))));
        return;
      }
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      pointers.set(e.pointerId, { ...prev, ...p });
      this.recentering = false;
      if (axisDrag) {
        const f = freeFrom(win);
        if (f) this.free = { center: f.center, half: f.half * Math.exp(0.006 * dy) };
        return;
      }
      if (this.crosshair) {
        this.crosshair = p;
        return;
      }
      this.offset += dx / spacingOf(plotW);
      clampOffset(plotW);
      if (Math.abs(dy) > 0 && win) {
        const f = freeFrom(win)!;
        this.free = { center: f.center + (dy / ((win.bottom - win.top) / 2)) * f.half, half: f.half };
      }
    };
    const up = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!prev) return;
      const p = local(e);
      const quick = performance.now() - prev.at < TAP_MS && Math.hypot(p.x - prev.startX, p.y - prev.startY) < TAP_PX;
      if (!quick) return;
      const now = performance.now();
      if (now - lastTap.at < DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < DOUBLE_TAP_PX) {
        this.recentre();
        lastTap = { at: 0, x: 0, y: 0 };
        return;
      }
      lastTap = { at: now, ...p };
      this.crosshair = this.crosshair ? null : p;
      this.lastDetent = "";
      this.onDetent();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const { plotW, win } = geom();
      const p = local(e);
      this.recentering = false;
      if (p.x > plotW) {
        const f = freeFrom(win);
        if (f) this.free = { center: f.center, half: f.half * Math.exp(0.002 * e.deltaY) };
        return;
      }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        this.offset -= e.deltaX / spacingOf(plotW);
        clampOffset(plotW);
        return;
      }
      this.spacing = Math.min(SPACING_MAX, Math.max(SPACING_MIN, spacingOf(plotW) * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
    };
  }
}
