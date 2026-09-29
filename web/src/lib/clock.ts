"use client";

/**
 * One shared clock for the whole app, read only by the leaf components that display time (plan §3.2 "Clock";
 * ux-audit fix 12, R2). One `setInterval` per tab no matter how many readers; readers subscribe through
 * `useSyncExternalStore`, so only they re-render on a tick. The server snapshot is 0 ("no time yet"), which is also
 * what `cacheComponents` requires: no `Date.now()` during a prerender.
 *
 * `offsetMs` is the chain-clock correction (`@cwf/markets` `nowMs()`), applied by whoever syncs it.
 */
import { useSyncExternalStore } from "react";

type Listener = () => void;

const listeners = new Set<Listener>();
let now = 0;
let offsetMs = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  now = Date.now() + offsetMs;
  for (const l of listeners) l();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (!timer) {
    tick();
    timer = setInterval(tick, 1_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Applies the chain-clock offset (ms) to every reader. */
export function setClockOffset(ms: number): void {
  offsetMs = ms;
  if (timer) tick();
}

/** Chain-corrected now, ticking once a second; 0 on the server and before the first tick. */
export function useNowMs(): number {
  return useSyncExternalStore(subscribe, () => now, () => 0);
}
