// Ported from Agari 4c0278ad:web/src/features/landing/og/theme.ts (the values now come from `@cwf/tokens`).
/**
 * The link-preview canvas (L-23, Y-14). Satori reads no stylesheet and no CSS variables, so the dark palette is read
 * here as plain colour strings, one per token the images use. Previews always render the dark ground: a link card has
 * no theme toggle.
 */
import { tokens } from "@cwf/tokens";

const p = tokens.palette.dark;

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

export const OG = {
  ground: p.bg,
  ink: p.white,
  soft: p["gray-400"],
  dim: p["gray-500"],
  hairline: p["gray-800"],
  /** `.crop` corner marks. */
  crop: "rgba(255, 255, 255, 0.18)",
  vermilion: p.vermilion,
  up: p.profit,
  down: p.loss,
} as const;

/** The canvas inset every image shares. */
export const OG_PAD = 72;
