/**
 * An order's `expireTs` (seconds): a dead-man's switch one headroom past now, never beyond the lock (canon #6; engine
 * `expireTs ≤ lockAt`). Inside the no-entry buffer there is no admissible expiry, so the order is refused. A pre-open
 * PostOnly rests until the entry cut-off. Masayume 68f7a09:packages/markets/src/submitter/steps/expiry.ts, in seconds.
 */
import { diagnosis, noEntryCutoffSec, orderExpirySec, type EntryWindow } from "@cwf/core";
import { OrderRefusedError } from "./errors";

export function takerExpirySec(nowSec: number, window: EntryWindow): number {
  const expiry = orderExpirySec(nowSec, window);
  if (expiry === null) throw new OrderRefusedError(diagnosis("market-not-trading", "inside the no-entry buffer before lock"));
  return expiry;
}

export function restingExpirySec(nowSec: number, window: EntryWindow): number {
  const cutoff = noEntryCutoffSec(window);
  if (nowSec >= cutoff) throw new OrderRefusedError(diagnosis("market-not-trading", "inside the no-entry buffer before lock"));
  return cutoff;
}
