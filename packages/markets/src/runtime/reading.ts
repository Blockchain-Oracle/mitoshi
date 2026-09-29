// Ported from Masayume 68f7a09:packages/markets/src/provider/reading.ts
import { err, ok, stale, type Reading, type ReadingOk, type StaleReason } from "@cwf/core";
import { diagnose } from "../errors/error-map";
import { ReadingError } from "../errors/reading-error";
import { nowMs } from "./clock";

const lastGood = new Map<string, ReadingOk<unknown>>();

/** Unwraps an inner reading inside a composed read: an error arm aborts the outer read with the inner diagnosis. */
export type Unwrap = <U>(reading: Reading<U>) => U;

/** Standalone unwrap for code outside `withReading` (e.g. Submitter steps): throws a `ReadingError` on the error arm. */
export function unwrap<U>(reading: Reading<U>): U {
  if (!reading.ok) throw new ReadingError(reading.error);
  return reading.value;
}

/**
 * The one place staleness is decided (AD-6): a first-ever failure is the error arm; a failed refresh keeps the
 * last-good value at full value and flips `stale`; a read composed from a stale inner reading is itself stale.
 */
export async function withReading<T>(key: string, read: (inner: Unwrap) => Promise<T>): Promise<Reading<T>> {
  let innerStale: StaleReason | null = null;
  const inner: Unwrap = (reading) => {
    if (!reading.ok) throw new ReadingError(reading.error);
    if (reading.stale) innerStale ??= reading.staleReason ?? "aged";
    return reading.value;
  };
  try {
    const fresh = ok(await read(inner), nowMs());
    lastGood.set(key, fresh);
    return innerStale ? stale(fresh, innerStale) : fresh;
  } catch (error) {
    const previous = lastGood.get(key) as ReadingOk<T> | undefined;
    return previous ? stale(previous, "refresh-failed") : err(diagnose(error));
  }
}

export function forgetReading(key: string): void {
  lastGood.delete(key);
}
