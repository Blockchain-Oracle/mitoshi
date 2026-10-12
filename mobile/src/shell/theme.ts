// The native colours and type (D-227, MOBILE): the web's token source (packages/tokens), so the root view, the web
// view's ground and the offline screen are the web's own dark and light themes — no literal colour lives here.
import tokens from "@cwf/tokens/tokens.json";

export type Mode = "dark" | "light";

export interface Palette {
  ground: string;
  ink: string;
  muted: string;
  accent: string;
  /** Text on the accent (the web's `.boundary-retry`: the lightest cream in both themes). */
  onAccent: string;
}

export function palette(mode: Mode): Palette {
  const p = tokens.palette[mode];
  return { ground: p.bg, ink: p.white, muted: p["gray-400"], accent: p.vermilion, onAccent: tokens.palette.light["gray-950"] };
}

/** A token size (a CSS pixel string) as React Native's unitless number. */
const size = (value: string): number => Number.parseFloat(value);

export const TYPE = {
  headline: { fontSize: size(tokens.type.headline.size), lineHeight: size(tokens.type.headline.size) * 1.15 },
  body: { fontSize: size(tokens.type.body.size), lineHeight: size(tokens.type.body.size) * 1.55 },
  caption: { fontSize: size(tokens.type.caption.size), lineHeight: size(tokens.type.caption.size) * 1.45 },
};

export const SPACE = {
  gutter: size(tokens.spacing.gutter),
  touch: size(tokens.spacing.touch),
  radius: size(tokens.radius.md),
};
