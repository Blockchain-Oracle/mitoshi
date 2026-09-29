"use client";

/**
 * One polite live region per screen (ux-audit §8: every StaleTick was its own region). Surfaces call `announce()`
 * for a transition worth hearing — "prices paused", "confirmed" — and the region speaks the latest one.
 */
import { useSyncExternalStore } from "react";

let message = "";
const listeners = new Set<() => void>();

export function announce(text: string): void {
  message = "";
  for (const l of listeners) l();
  // Re-set on the next frame so the same words announce twice when they recur.
  requestAnimationFrame(() => {
    message = text;
    for (const l of listeners) l();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function LiveRegion() {
  const text = useSyncExternalStore(subscribe, () => message, () => "");
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
