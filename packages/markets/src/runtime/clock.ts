// Ported from Masayume 68f7a09:packages/markets/src/provider/{clock,clock-sync}.ts
import { msToSec, secToMs, type ClockSync } from "@cwf/core";
import { getPublicClient } from "./read-runtime";

let offsetMs = 0;
let lastSync: ClockSync | null = null;

/** Chain-offset-corrected wall clock. Raw device time never drives a phase. */
export function nowMs(): number {
  return Date.now() + offsetMs;
}

export function nowSec(): number {
  return msToSec(nowMs());
}

export function applyClockSync(sync: ClockSync): void {
  offsetMs = sync.offsetMs;
  lastSync = sync;
}

export function lastClockSync(): ClockSync | null {
  return lastSync;
}

/** Samples the chain head once; block timestamps are whole seconds, so half the round trip is the best midpoint. */
export async function sampleChainClock(): Promise<ClockSync> {
  const startedMs = Date.now();
  const block = await getPublicClient().getBlock();
  const rttMs = Date.now() - startedMs;
  const chainMs = secToMs(Number(block.timestamp)) + rttMs / 2;
  const sync: ClockSync = { offsetMs: Math.round(chainMs - Date.now()), rttMs, blockNumber: Number(block.number) };
  applyClockSync(sync);
  return sync;
}
