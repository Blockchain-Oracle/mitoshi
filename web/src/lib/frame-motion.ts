"use client";
/**
 * The frame's own motion setting, for an animation CSS can't reach (the Web Animations API, NumberFlow) — R4-2, D-227;
 * the games spec: every kit piece honours the frame's `data-reduced-motion`. The games frame (`GamesShell`) sets it from
 * its settings, and its explicit choice beats the OS in both directions; the stylesheet rule in games.css only stops CSS
 * animations. Returns the nearest `[data-reduced-motion]` ancestor's choice, or null outside any frame (the caller then
 * follows `prefers-reduced-motion` as before). Watches the attribute, so a change in the settings sheet applies at once.
 */
import { useEffect, useState, type RefObject } from "react";

const ATTR = "data-reduced-motion";

export function useFrameReducedMotion(ref: RefObject<Element | null>): boolean | null {
  const [choice, setChoice] = useState<boolean | null>(null);
  useEffect(() => {
    const frame = ref.current?.closest(`[${ATTR}]`) ?? null;
    if (!frame) {
      setChoice(null);
      return;
    }
    const sync = () => setChoice(frame.getAttribute(ATTR) === "true");
    sync();
    const watch = new MutationObserver(sync);
    watch.observe(frame, { attributes: true, attributeFilter: [ATTR] });
    return () => watch.disconnect();
  }, [ref]);
  return choice;
}
