"use client";
// The page's one connection store (R6 shell S04/T05/T04; the state machine is `connection-core.ts`): fed by the
// browser's online/offline events, the query cache's reads (providers/query-client.ts reports each one) and the price
// stream's state; read by the top line's strip, the health chip and the offline-blocked actions. A retry refetches the
// active reads that failed or went stale (the query client registers how), on its backoff or on "Retry"; coming back
// online retries at once.
import { useSyncExternalStore } from "react";
import { CONNECTION } from "./connection-copy";
import { INITIAL, isConnectionKind, onFailure, onOnline, onRetry, onSuccess, type ConnectionState } from "./connection-core";

let state: ConnectionState = INITIAL;
const listeners = new Set<() => void>();
let retryHandler: (() => unknown) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let wired = false;

const jitter = () => Math.random() * 2 - 1;

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!state.online || !state.failing || state.retrying) return;
  timer = setTimeout(retryNow, Math.max(0, state.failing.nextRetryAtMs - Date.now()));
}

function set(next: ConnectionState): void {
  if (next === state) return;
  state = next;
  schedule();
  listeners.forEach((l) => l());
}

/** Fire the retry now ("Retry", or back online). */
export function retryNow(): void {
  if (typeof navigator !== "undefined") set(onOnline(state, navigator.onLine, Date.now()));
  if (!state.failing || !state.online) return;
  set(onRetry(state, Date.now(), jitter()));
  void Promise.resolve(retryHandler?.())
    .catch(() => undefined)
    .finally(() => state.retrying && set({ ...state, retrying: false }));
}

/** The reads failing now, by key (a query's hash, "stream"): the notice clears when every one has recovered or left. */
const failingKeys = new Set<string>();

/** A read failed for a connection reason (domain failures are ignored here). */
export function reportReadFailure(kind: string, key: string, hintMs = 0): void {
  if (!isConnectionKind(kind)) return;
  wire();
  failingKeys.add(key);
  set(onFailure(state, kind, Date.now(), jitter(), hintMs));
}

/** A read came back live, or left the screen. */
export function reportReadSuccess(key: string): void {
  failingKeys.delete(key);
  if (failingKeys.size === 0) set(onSuccess(state, Date.now()));
}

/** How a retry refetches (the query client registers it; no import cycle). */
export function setRetryHandler(fn: () => unknown): void {
  retryHandler = fn;
}

function wire(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;
  state = onOnline(state, navigator.onLine, Date.now());
  window.addEventListener("online", () => {
    set(onOnline(state, true, Date.now()));
    retryNow();
  });
  window.addEventListener("offline", () => set(onOnline(state, false, Date.now())));
  // The price stream: a stream that had opened and now retries is ops unreachable — prices freeze, so the strip says so.
  void import("@cwf/markets/stream").then(({ streamEverOpened, subscribeStreamState }) =>
    subscribeStreamState((s) => {
      if (s === "open") reportReadSuccess("stream");
      else if ((s === "retrying" || s === "closed") && streamEverOpened()) reportReadFailure("ops-down", "stream");
    }),
  );
}

const subscribe = (l: () => void) => {
  wire();
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function useConnection(): ConnectionState {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL);
}

/** Offline blocks a send (UP/DOWN, Place, Supply): the words the button says, or null. Failing alone does not. */
export function useOfflineBlocker(): string | null {
  return useConnection().online ? null : CONNECTION.blocked;
}
