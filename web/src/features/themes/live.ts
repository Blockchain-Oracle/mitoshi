"use client";
// The themes pages stay current without reading from the browser (R6, D-230): the server keeps the reads
// (`themes.server.ts`), and a visible page asks for a fresh render once a minute (`router.refresh()` re-runs the page's
// server half against the shared cache — no client waterfall). After a confirmed follow or publish the page expires the
// cache first (`/api/themes/revalidate`), so the change shows on the next render rather than within 30 s.
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

const REFRESH_MS = 60_000;

/** Re-renders the page from the server every minute while it is visible, and once when it comes back into view. */
export function useServerRefresh(everyMs = REFRESH_MS): void {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < everyMs / 2) return;
      last = Date.now();
      router.refresh();
    };
    const timer = setInterval(refresh, everyMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, everyMs]);
}

/** After a confirmed write: expire the server's cache, then render again. */
export function useThemesRefresh(): () => Promise<void> {
  const router = useRouter();
  return useCallback(async () => {
    await fetch("/api/themes/revalidate", { method: "POST" }).catch(() => undefined);
    router.refresh();
  }, [router]);
}

/** The catalogue's and a theme page's minute refresh, as a node a server page can drop in. */
export function ServerRefresh(): null {
  useServerRefresh();
  return null;
}
