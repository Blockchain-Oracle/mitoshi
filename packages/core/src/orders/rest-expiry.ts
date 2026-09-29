// Ported from Agari 03b30ab:packages/core/src/orders/rest-expiry.ts
/**
 * When a pre-open call stops resting (D-088 r2): by default `trading_start + 90 s`, so it fills within the first minute
 * after the bell or the stake comes back through the lock sweep; "until the lock" is an opt-in, and the engine refuses
 * anything past `lock_at` (6108). Null when no admissible expiry is left.
 */
export const REST_AFTER_BELL_SEC = 90;

export type RestUntil = "bell" | "lock";

export interface RestWindow {
  tradingStartSec: number;
  lockAtSec: number;
}

export function restExpirySec(nowSec: number, w: RestWindow, until: RestUntil = "bell"): number | null {
  if (until === "lock") return w.lockAtSec > nowSec ? w.lockAtSec : null;
  const bell = Math.max(w.tradingStartSec, nowSec) + REST_AFTER_BELL_SEC;
  const expirySec = Math.min(bell, w.lockAtSec);
  return expirySec > nowSec ? expirySec : null;
}

/** Whether an order's expiry reads as "until the lock" rather than the bell window. */
export function restUntilOf(expireSec: number, w: RestWindow): RestUntil {
  return expireSec >= w.lockAtSec ? "lock" : "bell";
}
