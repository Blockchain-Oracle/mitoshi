// Ported from Masayume 68f7a09:packages/core/src/units/time.ts
const MS_PER_SEC = 1000;
const NS_PER_SEC = 1_000_000_000n;

export function secToMs(sec: number): number {
  return sec * MS_PER_SEC;
}

export function msToSec(ms: number): number {
  return Math.floor(ms / MS_PER_SEC);
}

/** Order expiry crosses into the SDK in nanoseconds — the only place ns exist is the Submitter (Time convention). */
export function secToNs(sec: number): bigint {
  return BigInt(sec) * NS_PER_SEC;
}

/** Whole seconds left until `expirySec`, never negative. */
export function remainingSec(nowMs: number, expirySec: number): number {
  return Math.max(0, Math.ceil((secToMs(expirySec) - nowMs) / MS_PER_SEC));
}
