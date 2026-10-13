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

function start() {
  if (timer || typeof document === "undefined" || document.visibilityState === "hidden") return;
  tick();
  timer = setInterval(tick, 1_000);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

let visibilityBound = false;

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (!visibilityBound && typeof document !== "undefined") {
    visibilityBound = true;
    // Hidden tabs tick nothing (AD-6); a returning tab re-reads the clock at once.
    document.addEventListener("visibilitychange", () => (document.visibilityState === "hidden" ? stop() : listeners.size > 0 && start()));
  }
  start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

/** Applies the chain-clock offset (ms) to every reader. */
export function setClockOffset(ms: number): void {
  offsetMs = ms;
  if (timer) tick();
}

/**
 * The client's first read seeds the clock (D-230 item 6): a tab or app web view hidden at load never started the
 * interval, so `now` stayed 0, every phase read null and the terminal sat on "Syncing the chain clock…" until a
 * visibility event that a web view may never send. Seeded, a hidden page holds its last second until it ticks again.
 */
const snapshot = () => (now === 0 && typeof window !== "undefined" ? (now = Date.now() + offsetMs) : now);

/** Chain-corrected now, ticking once a second; 0 on the server. */
export function useNowMs(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}

/**
 * A value derived from the clock (a Window's phase, the minute a board groups on): the reader re-renders when the
 * derived value changes, not on every tick (D-181) — `useSyncExternalStore` compares snapshots with `Object.is`, so
 * `derive` must return a primitive. It sees 0 before the first client tick, as `useNowMs` readers do.
 */
export function useClockValue<T extends string | number | boolean | null>(derive: (nowMs: number) => T): T {
  return useSyncExternalStore(subscribe, () => derive(snapshot()), () => derive(0));
}

/** Chain-corrected now for an event handler or a one-off decision (not for rendering — render with `useNowMs`). */
export function nowMs(): number {
  return Date.now() + offsetMs;
}
