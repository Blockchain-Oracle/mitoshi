// Ported from Agari 03b30ab:packages/core/src/lifecycle/countdown.ts
import { remainingSec } from "../units/time";
import { urgentAtSec } from "./urgency";

export interface Countdown {
  remainingSec: number;
  urgent: boolean;
  /** True at zero: the window is settling — never negative, never frozen. */
  settling: boolean;
  /** Fraction of the window still to run, in [0, 1]. */
  fraction: number;
}

export function countdown(nowMs: number, expirySec: number, intervalSec: number): Countdown {
  const remaining = remainingSec(nowMs, expirySec);
  const span = Math.max(1, intervalSec);
  return {
    remainingSec: remaining,
    urgent: remaining > 0 && remaining <= urgentAtSec(intervalSec),
    settling: remaining === 0,
    fraction: Math.min(1, remaining / span),
  };
}
