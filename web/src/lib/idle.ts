/**
 * Runs `fn` when the main thread is idle after hydration (or after 1.5 s at the latest). Lazy islands the user is
 * likely to open — the desktop nav menus, the phone More panel — preload here, so they stay out of the first load
 * (§3.1) and still open instantly.
 */
export function onIdle(fn: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(fn, { timeout: 1_500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 200);
  return () => clearTimeout(id);
}
