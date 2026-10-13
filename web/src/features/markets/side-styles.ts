// Ported from Masayume 68f7a09:web/src/features/markets/side-styles.ts
import type { Side } from "@cwf/core";
import { MARKETS } from "./copy";

/** The up/down washes from the token surfaces; the side word is always present next to them (color law). Keyed to
 *  `aria-checked`: the segments are radios (R4-3 review, D-227 — `aria-pressed` is not allowed on a radio). */
export const SIDE_CLASSES: Record<Side, string> = {
  up: "border-(--button-up-border) text-(--button-up-ink) aria-checked:bg-(--button-up-fill)",
  down: "border-(--button-down-border) text-(--button-down-ink) aria-checked:bg-(--button-down-fill)",
};

export const SIDE_WORD: Record<Side, string> = { up: MARKETS.up, down: MARKETS.down };

export const SIDES: readonly Side[] = ["up", "down"];
