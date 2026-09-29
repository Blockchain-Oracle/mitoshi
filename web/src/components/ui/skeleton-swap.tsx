"use client";

// From 21st.dev 23557 (Skeleton Swap) — revamped per D-044: the component's no-flash timing kept (skeleton only after
// 120 ms, then held ≥ 380 ms so it never blinks), Masayume's pulse bars on `surface-2`, a crossfade under `m.*`
// (instant under reduced motion), `aria-busy` while loading. The reserved height is the caller's (no layout jump).
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function useSkeletonSwap(ready: boolean, delay = 120, minVisible = 380): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (!ready) {
      if (visible) return;
      const t = setTimeout(() => {
        shownAt.current = performance.now();
        setVisible(true);
      }, delay);
      return () => clearTimeout(t);
    }
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), Math.max(0, minVisible - (performance.now() - shownAt.current)));
    return () => clearTimeout(t);
  }, [ready, visible, delay, minVisible]);
  return visible;
}

const WIDTHS = ["w-full", "w-11/12", "w-10/12", "w-9/12", "w-8/12"] as const;

export function SkeletonSwap({ ready, children, lines = 3, label, className }: { ready: boolean; children: ReactNode; lines?: number; label?: string; className?: string }) {
  const showSkeleton = useSkeletonSwap(ready);
  const reduced = useReducedMotion();
  const fade = { duration: reduced ? 0 : 0.18 };
  return (
    <div aria-busy={!ready} aria-label={label} className={cn("grid", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        {showSkeleton || !ready ? (
          <m.div key="skeleton" className="col-start-1 row-start-1 flex flex-col gap-3" initial={{ opacity: 0 }} animate={{ opacity: showSkeleton ? 1 : 0 }} exit={{ opacity: 0 }} transition={fade} aria-hidden>
            {Array.from({ length: lines }, (_, i) => (
              <div key={i} className={cn("h-3 animate-pulse rounded-sm bg-surface-2 motion-reduce:animate-none", i === lines - 1 && lines > 1 ? "w-7/12" : WIDTHS[(i * 3 + 1) % WIDTHS.length])} />
            ))}
          </m.div>
        ) : (
          <m.div key="content" className="col-start-1 row-start-1 min-w-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade}>
            {children}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
