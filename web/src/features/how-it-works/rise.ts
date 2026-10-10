// Ported from Masayume 68f7a09:web/src/features/how-it-works/rise.ts unchanged.
import type { CSSProperties } from "react";

/** The reference's framer-motion stagger: `transition={{ delay: index * 0.08 }}`, as a CSS delay. */
const STEP_MS = 80;

export function riseDelay(index: number, baseMs = 0): CSSProperties {
  return { animationDelay: `${baseMs + index * STEP_MS}ms` };
}
