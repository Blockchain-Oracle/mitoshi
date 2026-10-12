"use client";
// Ported from Owarine 90a91d71:web/src/components/kit/InfiniteSlider.tsx (R4-2, D-227), itself 21st.dev "Logo Marquee"
// by grootstudio (motion-primitives `InfiniteSlider`, adapted): the children twice, slid by one copy's measured width at
// a constant speed, slowing (not stopping) under the pointer. Here on the Web Animations API instead of a motion runtime
// (`updatePlaybackRate` eases the slow-down); measured with a ResizeObserver. Reduced motion: it stands still and
// scrolls by hand. The second copy is inert and hidden from assistive tech.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const REDUCE = "(prefers-reduced-motion: reduce)";

export function InfiniteSlider({ children, gapRem = 1, duration = 40, durationOnHover, reverse = false, className }: { children: ReactNode; gapRem?: number; /** Seconds for one copy to pass. */ duration?: number; durationOnHover?: number; reverse?: boolean; className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const run = useRef<Animation | null>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(REDUCE);
    const sync = () => setStill(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el || still) return;
    const start = () => {
      run.current?.cancel();
      const gap = gapRem * parseFloat(getComputedStyle(document.documentElement).fontSize);
      const span = (el.scrollWidth + gap) / 2;
      if (span <= 0) return;
      const frames = reverse ? [{ translate: `${-span}px 0` }, { translate: "0 0" }] : [{ translate: "0 0" }, { translate: `${-span}px 0` }];
      run.current = el.animate(frames, { duration: duration * 1000, iterations: Infinity, easing: "linear" });
    };
    start();
    const ro = new ResizeObserver(start);
    ro.observe(el);
    return () => {
      ro.disconnect();
      run.current?.cancel();
      run.current = null;
    };
  }, [still, gapRem, duration, reverse]);

  const slow = (on: boolean) => {
    if (!durationOnHover || !run.current) return;
    run.current.updatePlaybackRate(on ? duration / durationOnHover : 1);
  };

  return (
    <div className={cn("kit-slider", className)} data-still={still ? "" : undefined} style={{ "--kit-gap": `${gapRem}rem` } as CSSProperties} onPointerEnter={() => slow(true)} onPointerLeave={() => slow(false)}>
      <div ref={track} className="kit-slider-track">
        {children}
        <div aria-hidden inert className="kit-slider-copy">
          {children}
        </div>
      </div>
    </div>
  );
}
