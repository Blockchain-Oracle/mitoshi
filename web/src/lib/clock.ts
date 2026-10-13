"use client";

/**
 * One shared clock for the whole app, read only by the leaf components that display time (plan §3.2 "Clock";
 * ux-audit fix 12, R2). One timer per tab no matter how many readers; readers subscribe through
 * `useSyncExternalStore`, so only they re-render on a tick. The server snapshot is 0 ("no time yet"), which is also
 * what `cacheComponents` requires: no `Date.now()` during a prerender.
 *
 * `offsetMs` is the chain-clock correction (`@cwf/markets` `nowMs()`), applied by whoever syncs it.
 *
 * How it ticks (D-230 item 6): once a second while the page is visible; nothing in a tab hidden after it was seen
 * (AD-6) — it re-reads the moment it returns. A page hidden from its very load is different: an app's web view or a
 * prerendered tab can report "hidden" and never send `visibilitychange`, and a clock waiting for that event froze —
 * the phase stayed null ("Syncing the chain clock…") or every countdown stopped and an upcoming Window never turned to
 * trading. So until the page has once been seen, it ticks every 5 s; and any sign the page is in use (focus, a pointer,
 * a key) starts the 1 s tick whatever `visibilityState` claims.
 */
import { useSyncExternalStore } from "react";

type Listener = () => void;

/** The visible tick, and the slow one of a page hidden since load (never once seen). */
export const TICK_MS = 1_000;
export const HIDDEN_AT_LOAD_TICK_MS = 5_000;
/** Signs a person is using the page — none of them reach a tab in the background (unlike `pageshow` or `resize`). */
const ALIVE_EVENTS = ["focus", "pointerdown", "keydown"] as const;

const listeners = new Set<Listener>();
let now = 0;
let offsetMs = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let timerMs = 0;
let seen = false;
let inUse = false;
let bound = false;

function tick() {
  now = Date.now() + offsetMs;
  for (const l of listeners) l();
}

const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

/** The tick the page should run now: 1 s when visible or in use, 5 s hidden since load, none hidden after being seen. */
function wantedMs(): number {
  if (listeners.size === 0 || typeof document === "undefined") return 0;
  if (!hidden() || inUse) return TICK_MS;
  return seen ? 0 : HIDDEN_AT_LOAD_TICK_MS;
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  timerMs = 0;
}

/** Runs the tick the page wants (re-reading the clock at once when it speeds up). */
function retune() {
  if (!hidden()) seen = true;
  const ms = wantedMs();
  if (ms === timerMs) return;
  const faster = timerMs === 0 || ms < timerMs;
  stop();
  if (ms === 0) return;
  if (faster) tick();
  timer = setInterval(tick, ms);
  timerMs = ms;
}

function bind() {
  if (bound || typeof document === "undefined") return;
  bound = true;
  document.addEventListener("visibilitychange", () => {
    // A real hide ends "in use" until the next sign of it; a return re-reads the clock at once.
    if (hidden()) inUse = false;
    retune();
  });
  if (typeof window === "undefined") return;
  const alive = () => {
    if (inUse && timerMs === TICK_MS) return;
    inUse = true;
    retune();
  };
  for (const e of ALIVE_EVENTS) window.addEventListener(e, alive, { capture: true, passive: true });
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  bind();
  retune();
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

/** The client's first read seeds the clock, so nothing renders "no time yet" while the first tick is pending. */
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

/** The store as `useSyncExternalStore` sees it (tests drive it without React). */
export const clockStore = { subscribe, snapshot, tickMs: () => timerMs };
