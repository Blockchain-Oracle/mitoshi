"use client";
// Ported from Agari 03b30ab:web/src/features/markets/reels/useReelPosition.ts (S13 step 9) — where the reel is, kept in
// the address: the card on screen writes `?w=<marketId>` (the terminal's own Window parameter) with `replaceState`, and
// on mount the reel scrolls once to the card that names, the moment it exists; leaving to call and coming back lands
// on the same card. ↑/↓ and PageUp/PageDown move one card, outside text fields.
import { useEffect, useRef, type RefObject } from "react";
import type { ReelItem } from "./weave";

export const REEL_PARAM = "w";

/** `leading` counts cards rendered before the reel's first item (the closed-market card), so a restore scrolls right. */
export function useReelPosition(scrollRef: RefObject<HTMLElement | null>, reel: readonly ReelItem[], activeIndex: number, leading = 0): void {
  const restored = useRef(false);
  // False between a restore that scrolled and the observer's first report, so the first card's id is not stamped over it.
  const armed = useRef(false);

  useEffect(() => {
    if (restored.current || reel.length === 0) return;
    restored.current = true;
    const wanted = new URLSearchParams(window.location.search).get(REEL_PARAM);
    const index = wanted ? reel.findIndex((item) => item.kind === "market" && item.market.marketId === wanted) : -1;
    const card = index >= 0 && index + leading > 0 ? (scrollRef.current?.children[index + leading] as HTMLElement | undefined) : undefined;
    if (card) {
      card.scrollIntoView({ block: "start" });
      armed.current = false;
    } else {
      armed.current = true;
    }
  }, [reel, scrollRef, leading]);

  useEffect(() => {
    if (!armed.current) {
      if (activeIndex === 0) return;
      armed.current = true;
    }
    const item = reel[activeIndex];
    if (!item || item.kind !== "market") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(REEL_PARAM) === item.market.marketId) return;
    url.searchParams.set(REEL_PARAM, item.market.marketId);
    window.history.replaceState(window.history.state, "", url);
  }, [reel, activeIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const root = scrollRef.current;
      if (!root || event.altKey || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) return;
      const step = event.key === "ArrowDown" || event.key === "PageDown" ? 1 : event.key === "ArrowUp" || event.key === "PageUp" ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      root.scrollBy({ top: step * root.clientHeight, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scrollRef]);
}
