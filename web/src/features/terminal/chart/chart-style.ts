// Ported from Owarine ecb7565b:web/src/features/terminal/chart/chart-style.ts — Mitoshi's levels (D-197/D-200: the
// Window's opening print as "Line", TP, SL, the Boost knock-out, the signed tick) and theme keys (DESIGN.md chart map).
/** The chart's shared types, metrics and level styles (Tradash's dashes and widths), and a token-colour-at-alpha helper. */

/** Colours and fonts, read from the `--chart-*` tokens (`LiveChart.readTheme`). */
export type ChartTheme = Record<"up" | "down" | "ink" | "inverse" | "helper" | "warn" | "signed" | "darkText" | "lightText", string> &
  Record<"axisFont" | "pillFont" | "pillPriceFont" | "pillPnlFont" | "tagFont" | "tagStrongFont" | "markFont", string>;

/**
 * `entry`: the spot when the call was made; `line`: the Window's opening print (what Up must close at or above);
 * `breakeven`: the spot where Close pays the cost back; `tp`/`sl`/`trail`: the exits; `knockout`: a Boost position's
 * knock-out spot; `signed`: the newest signed (RedStone) value — what the Window will actually settle on.
 */
export type LevelKind = "entry" | "line" | "breakeven" | "tp" | "sl" | "trail" | "knockout" | "signed";

export interface ChartLevel {
  kind: LevelKind;
  price: number;
  label: string;
}

/** The open position as the chart draws it; null when flat (a flat chart may still carry the Line and signed tick). */
export interface ChartOverlay {
  /** Live PnL sign decides the colour (≥ 0 is up); null draws no PnL row. */
  pnl: number | null;
  /** The pill's second row ("+$3.70"), or "" with no position. */
  pnlText: string;
  /** The band runs between the line and this price (the entry spot). */
  entry: number | null;
  levels: ChartLevel[];
}

export interface FrameInfo {
  price: number;
  /** Eased price change this frame, in grid steps (DotGrid parallax). */
  velocitySteps: number;
  /** Pixels the view scrolled this frame (one sample in line view; the slide or pan in candles). */
  scrollX: number;
  headX: number;
  headY: number;
}

export type ChartView = "line" | "candles";

export const PAD_Y = 28;
export const PILL_RIGHT = 14;
export const PILL_GAP = 10;
export const MIN_PLOT_LEFTOVER = 96;
export const PILL_H = 26;
export const PILL_H_POSITION = 34;
export const LABEL_RIGHT = 14;
export const TAG_H = 15;

export const LEVEL_STYLE: Record<LevelKind, { dash: number[]; width: number; alpha: number; strong?: boolean }> = {
  entry: { dash: [4, 4], width: 1, alpha: 0.55 },
  breakeven: { dash: [1, 3], width: 1, alpha: 0.75 },
  line: { dash: [2, 3], width: 1, alpha: 0.7 },
  tp: { dash: [6, 3], width: 1, alpha: 0.85 },
  sl: { dash: [6, 3], width: 1, alpha: 0.85 },
  trail: { dash: [6, 3], width: 1.5, alpha: 1, strong: true },
  knockout: { dash: [2, 2], width: 1.5, alpha: 0.9, strong: true },
  signed: { dash: [1, 2], width: 1, alpha: 0.6 },
};

/** A level's colour (DESIGN.md chart token map). */
export function levelColour(kind: LevelKind, theme: ChartTheme, tone: string): string {
  switch (kind) {
    case "line":
    case "sl":
      return theme.down;
    case "tp":
      return theme.up;
    case "breakeven":
    case "knockout":
      return theme.warn;
    case "trail":
      return tone;
    case "signed":
      return theme.signed;
    default:
      return theme.ink;
  }
}

/** A colour's channels via the canvas's own parser (hex, rgb() and named colours); null when it can't be read. */
function rgbOf(ctx: CanvasRenderingContext2D, colour: string): [number, number, number] | null {
  ctx.fillStyle = colour;
  const parsed = ctx.fillStyle;
  if (parsed.startsWith("#") && parsed.length === 7) return [1, 3, 5].map((i) => Number.parseInt(parsed.slice(i, i + 2), 16)) as [number, number, number];
  const m = /rgba?\(([^)]+)\)/.exec(parsed);
  if (!m) return null;
  const [r, g, b] = m[1]!.split(",").map((v) => Number(v.trim()));
  return [r!, g!, b!];
}

/**
 * Text on a filled pill or tag: the dark or the light text token, whichever reads on that fill (WCAG relative
 * luminance) — the up line is a light green in dark mode and a deep green in light mode, so no one text colour works.
 */
const textCache = new Map<string, string>();
export function textOn(ctx: CanvasRenderingContext2D, theme: ChartTheme, fill: string): string {
  const key = `${fill}|${theme.darkText}|${theme.lightText}`;
  const hit = textCache.get(key);
  if (hit) return hit;
  const rgb = rgbOf(ctx, fill);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = rgb ? 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]) : 0;
  // Contrast against black (lum + .05)/.05 vs against white 1.05/(lum + .05): dark text wins above ≈ 0.179.
  const out = lum > 0.179 ? theme.darkText : theme.lightText;
  textCache.set(key, out);
  return out;
}

/** A token colour at an alpha, via the canvas's own parser (handles hex, rgb() and named colours). */
const alphaCache = new Map<string, string>();
export function withAlpha(ctx: CanvasRenderingContext2D, colour: string, alpha: number): string {
  const key = `${colour}|${alpha}`;
  const hit = alphaCache.get(key);
  if (hit) return hit;
  ctx.fillStyle = colour;
  const parsed = ctx.fillStyle;
  let out = colour;
  if (parsed.startsWith("#") && parsed.length === 7) {
    const r = Number.parseInt(parsed.slice(1, 3), 16);
    const g = Number.parseInt(parsed.slice(3, 5), 16);
    const b = Number.parseInt(parsed.slice(5, 7), 16);
    out = `rgba(${r},${g},${b},${alpha})`;
  } else if (parsed.startsWith("rgb")) out = parsed.replace(/rgba?\(([^)]+)\)/, (_, inner: string) => `rgba(${inner.split(",").slice(0, 3).join(",")},${alpha})`);
  alphaCache.set(key, out);
  return out;
}
