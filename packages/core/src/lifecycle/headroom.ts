// Ported from Agari 03b30ab:packages/core/src/lifecycle/headroom.ts
import { ENTRY_BUFFER_SEC } from "../constants/timing";
import { secToMs } from "../units/time";

/**
 * The instants entry is measured against. Entry closes before `lock_at`, not the expiry: they are equal on
 * Regular and token Windows, but a Gap Window locks Sunday 20:00 ET and expires at Monday's open. Taking an
 * object (not positional seconds) keeps an expiry from being passed where the lock belongs.
 */
export interface EntryWindow {
  lockAtSec: number;
  intervalSec: number;
}

/** The same 30-second entry buffer for every cadence and execution surface. */
export function headroomSec(_intervalSec: number): number {
  return ENTRY_BUFFER_SEC;
}

/** The instant entry closes: lock less the headroom — the one definition every surface and the order lane share. */
export function noEntryCutoffSec(window: EntryWindow): number {
  return window.lockAtSec - headroomSec(window.intervalSec);
}

export function noEntryCutoffMs(window: EntryWindow): number {
  return secToMs(noEntryCutoffSec(window));
}

export function insideNoEntryBuffer(nowMs: number, window: EntryWindow): boolean {
  return nowMs >= noEntryCutoffMs(window);
}

/**
 * Expiry for a taker order: a dead-man's switch one headroom past now, never beyond the lock (canon #6; the
 * engine requires `expire_ts ≤ lock_at`). Null inside the no-entry buffer — there is no admissible expiry to send.
 */
export function orderExpirySec(nowSec: number, window: EntryWindow): number | null {
  if (nowSec >= noEntryCutoffSec(window)) return null;
  return Math.min(window.lockAtSec, nowSec + headroomSec(window.intervalSec));
}
