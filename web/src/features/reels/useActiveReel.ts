// Ported from Agari 03b30ab:web/src/features/markets/reels/useActiveReel.ts (S13 step 9), unchanged but for this line.
"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** How many cards either side of the one on screen keep their chart mounted. */
const NEIGHBOURS = 1;
const VISIBLE_FRACTION = 0.6;

export interface ActiveReel {
  /** Index of the card filling the screen; 0 before the first observation. */
  activeIndex: number;
  /** Ref callback for a card at `index`, so the observer can tell which one is on screen. */
  register: (index: number) => (element: HTMLElement) => () => void;
  /** Whether the card at `index` is close enough to be worth reading live. */
  isNear: (index: number) => boolean;
}

/**
 * Which card the reel is on.
 *
 * Yosuku shares one price series across every card and gates only the animated
 * redraw on an IntersectionObserver. Each Window here has its own history and its
 * own chart instance, so the same observer gates something heavier: a card more
 * than a swipe away does not fetch its series or mount a chart at all. Keeping the
 * immediate neighbours live is what stops the next card arriving blank.
 */
export function useActiveReel(scrollRef: RefObject<HTMLElement | null>, count: number): ActiveReel {
  const [activeIndex, setActiveIndex] = useState(0);
  const elements = useRef(new Map<HTMLElement, number>());
  const observer = useRef<IntersectionObserver | null>(null);
  const callbacks = useRef(new Map<number, (element: HTMLElement) => () => void>());

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = elements.current.get(entry.target as HTMLElement);
          if (index !== undefined) setActiveIndex(index);
        }
      },
      { root, threshold: VISIBLE_FRACTION },
    );
    observer.current = io;
    for (const element of elements.current.keys()) io.observe(element);
    return () => {
      io.disconnect();
      observer.current = null;
    };
    // `count` re-runs this once the first cards exist, so the observer never starts on an empty list.
  }, [scrollRef, count]);

  // Cached per index, because React re-runs a ref whose identity changed — and the
  // clock re-renders this list every second, which would otherwise detach and
  // re-observe every card once a second.
  //
  // React 19 ref cleanup: returning one keeps a swiped-past card out of both the map
  // and the observer, so a long session does not accumulate detached nodes.
  const register = useCallback((index: number) => {
    const cached = callbacks.current.get(index);
    if (cached) return cached;
    const ref = (element: HTMLElement) => {
      elements.current.set(element, index);
      observer.current?.observe(element);
      return () => {
        elements.current.delete(element);
        observer.current?.unobserve(element);
      };
    };
    callbacks.current.set(index, ref);
    return ref;
  }, []);

  const isNear = useCallback((index: number) => Math.abs(index - activeIndex) <= NEIGHBOURS, [activeIndex]);

  return { activeIndex, register, isNear };
}
