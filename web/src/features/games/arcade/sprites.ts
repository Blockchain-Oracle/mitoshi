/**
 * The arcade's arts, as pixel grids painted on the canvas — the same coin `PixelArt.tsx` draws on the
 * cards, so the flyer is the venue's own mark rather than the reference's face, and a diamond for the
 * ride's pip. One rect per cell, no image, nothing to load.
 */
export interface Sprite {
  rows: readonly string[];
  w: number;
  h: number;
}

function sprite(rows: readonly string[]): Sprite {
  return { rows, w: Math.max(...rows.map((r) => r.length)), h: rows.length };
}

/** The coin: V the accent, W a highlight, K the ground showing through as the ¥ stroke. */
export const COIN = sprite([
  ".....VVVVVV.....",
  "...VVVVVVVVVV...",
  "..VVWWVVVVVVVV..",
  ".VVWVVVVVVVVVVV.",
  ".VVVVVVKKVVVVVV.",
  "VVVVVVKKKKVVVVVV",
  "VVVVVKKVVKKVVVVV",
  "VVVVVKKVVKKVVVVV",
  "VVVVVKKVVKKVVVVV",
  "VVVVVVKKKKVVVVVV",
  ".VVVVVVKKVVVVVV.",
  ".VVVVVVVVVVVVVV.",
  "..VVVVVVVVVVVV..",
  "...VVVVVVVVVV...",
  ".....VVVVVV.....",
]);

/** The pip: a diamond with a lit centre. */
export const PIP = sprite([
  "..P..",
  ".PPP.",
  "PPWPP",
  ".PPP.",
  "..P..",
]);

/**
 * Paint a sprite centred on (cx, cy) with `cell` field units per pixel. The palette maps a character
 * to a fill; characters absent from it are transparent.
 */
export function drawSprite(ctx: CanvasRenderingContext2D, art: Sprite, palette: Readonly<Record<string, string>>, cx: number, cy: number, cell: number): void {
  const x0 = cx - (art.w * cell) / 2;
  const y0 = cy - (art.h * cell) / 2;
  for (let y = 0; y < art.h; y += 1) {
    const row = art.rows[y] as string;
    for (let x = 0; x < row.length; x += 1) {
      const fill = palette[row[x] as string];
      if (!fill) continue;
      ctx.fillStyle = fill;
      // A hair of overlap so the cells never show seams at fractional scales.
      ctx.fillRect(x0 + x * cell, y0 + y * cell, cell + 0.05, cell + 0.05);
    }
  }
}
