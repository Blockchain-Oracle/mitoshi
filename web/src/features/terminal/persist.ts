// Ported from Owarine ecb7565b:web/src/features/terminal/persist.ts — unchanged.
"use client";

/**
 * Saves a store to localStorage at most once a second, and at once when the page hides, instead of on every change: a
 * trailing stop moves on each favourable tick (5 Hz), and serialising the whole store each time cost a frame. Listeners
 * are told at once by the store itself; only the disk write waits. Storage that is blocked is skipped silently.
 */
const SAVE_EVERY_MS = 1_000;
const pending = new Map<string, () => unknown>();
let timer: ReturnType<typeof setTimeout> | null = null;
let hooked = false;

function flush(): void {
  timer = null;
  for (const [key, read] of pending) {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(read()));
    } catch {
      // Storage blocked: the state lasts for this tab.
    }
  }
  pending.clear();
}

export function persistSoon(key: string, read: () => unknown): void {
  pending.set(key, read);
  if (!hooked && typeof window !== "undefined") {
    hooked = true;
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  }
  timer ??= setTimeout(flush, SAVE_EVERY_MS);
}
