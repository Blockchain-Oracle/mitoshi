import type { Transition } from "motion/react";

/**
 * The stages' one motion vocabulary. Pips keeps twenty-two presets in `web/src/utils/motion.ts` and
 * every screen imports from it; nothing there tunes its own curve. The same here — the easings and
 * springs are Pips's by value, the two card timings are Flicky's (`swipe-screen.tsx`), and a stage
 * that wants a new feel adds a preset rather than a literal.
 */
export const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;
export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;
export const EASE_OUT_CUBIC = [0.33, 1, 0.68, 1] as const;
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_SNAPPY_OUT = [0.19, 1, 0.22, 1] as const;

export const SPRING_SMOOTH: Transition = { type: "spring", duration: 0.45, bounce: 0 };
export const SPRING_GENTLE: Transition = { type: "spring", duration: 0.55, bounce: 0 };
export const SPRING_BOUNCE: Transition = { type: "spring", duration: 0.6, bounce: 0.45 };
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 300, damping: 30 };
export const SPRING_SLIDE: Transition = { type: "spring", stiffness: 200, damping: 30, mass: 1 };
export const SPRING_CONTENT: Transition = { type: "spring", stiffness: 180, damping: 24, mass: 1 };

export const TWEEN_DEFAULT: Transition = { duration: 0.3, ease: EASE_OUT_CUBIC };
export const TWEEN_FAST: Transition = { duration: 0.2, ease: EASE_OUT_QUART };
export const TWEEN_SLOW: Transition = { duration: 0.5, ease: EASE_OUT_EXPO };
export const LAYOUT_TRANSITION: Transition = { type: "spring", stiffness: 250, damping: 30, mass: 0.8 };

/** Flicky: a thrown card leaves opaque and spinning, in 300 ms, ease-out. */
export const THROW: Transition = { duration: 0.3, ease: "easeOut" };
/** A card that was not thrown springs back to the origin. */
export const SETTLE: Transition = { type: "spring", stiffness: 260, damping: 26 };
/** Flicky: the card tilts up to 18° across half its size, and 6° more as it flies off. */
export const DRAG_MAX_ROTATE_DEG = 18;
export const FLY_ROTATE_DEG = DRAG_MAX_ROTATE_DEG + 6;
/** Flicky: the UP/DOWN stamp appears past this much travel. */
export const STAMP_AT_PX = 24;
