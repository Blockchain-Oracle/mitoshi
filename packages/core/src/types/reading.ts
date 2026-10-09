// Ported from Masayume 68f7a09:packages/core/src/schemas/reading.ts (split S23 gate, F-S23-08): the Reading type and
// its helpers, zod-free — `isOk` and `err` are on nearly every client path, and with the schema beside them every page
// that read anything pulled zod (~360 KB raw). The schema stays in `schemas/reading.ts`.
import type { Diagnosis } from "./diagnosis";

export const STALE_REASONS = ["refresh-failed", "aged", "offline"] as const;
export type StaleReason = (typeof STALE_REASONS)[number];

export interface ReadingOk<T> {
  ok: true;
  value: T;
  asOfMs: number;
  stale: boolean;
  staleReason?: StaleReason;
}

export interface ReadingErr {
  ok: false;
  error: Diagnosis;
}

/** Every read crossing the chain port: a first-ever failure is the error arm; a failed refresh keeps the last-good value and flips `stale`. */
export type Reading<T> = ReadingOk<T> | ReadingErr;

export function ok<T>(value: T, asOfMs: number): ReadingOk<T> {
  return { ok: true, value, asOfMs, stale: false };
}

export function err(error: Diagnosis): ReadingErr {
  return { ok: false, error };
}

export function stale<T>(prev: ReadingOk<T>, staleReason: StaleReason): ReadingOk<T> {
  return { ...prev, stale: true, staleReason };
}

export function isOk<T>(reading: Reading<T>): reading is ReadingOk<T> {
  return reading.ok;
}

export function mapReading<T, U>(reading: Reading<T>, fn: (value: T) => U): Reading<U> {
  return reading.ok ? { ...reading, value: fn(reading.value) } : reading;
}

/** Combines two readings: fails if either failed, is stale if either is stale, and is as old as the older one. */
export function combineReadings<A, B>(a: Reading<A>, b: Reading<B>): Reading<[A, B]> {
  if (!a.ok) return a;
  if (!b.ok) return b;
  const combined = ok<[A, B]>([a.value, b.value], Math.min(a.asOfMs, b.asOfMs));
  const reason = a.staleReason ?? b.staleReason;
  return a.stale || b.stale ? stale(combined, reason ?? "aged") : combined;
}
