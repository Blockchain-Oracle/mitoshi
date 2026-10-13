"use client";
/**
 * Skeleton-swap timing (From 21st.dev 23557, kept from the retired ui/skeleton-swap): the skeleton appears only after
 * `delayMs` and, once shown, holds ≥ `minVisibleMs` so it never blinks. True while the host should draw its skeleton.
 */
import { useEffect, useRef, useState } from "react";

export function useHeldLoading(ready: boolean, delayMs = 120, minVisibleMs = 380): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (!ready) {
      if (visible) return;
      const t = window.setTimeout(() => {
        shownAt.current = performance.now();
        setVisible(true);
      }, delayMs);
      return () => window.clearTimeout(t);
    }
    if (!visible) return;
    const t = window.setTimeout(() => setVisible(false), Math.max(0, minVisibleMs - (performance.now() - shownAt.current)));
    return () => window.clearTimeout(t);
  }, [ready, visible, delayMs, minVisibleMs]);
  return visible;
}
