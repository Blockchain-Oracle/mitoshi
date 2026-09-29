// Ported from Agari 03b30ab:packages/core/src/lifecycle/urgency.ts
import { URGENT_FRACTION, URGENT_MAX_SEC } from "../constants/timing";

/** Countdown turns gold at min(60, interval × 0.4) seconds — one glow per composition (UX-DR14). */
export function urgentAtSec(intervalSec: number): number {
  return Math.min(URGENT_MAX_SEC, Math.round(intervalSec * URGENT_FRACTION));
}
