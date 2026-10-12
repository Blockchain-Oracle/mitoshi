"use client";
// From 21st.dev 10484 moumensoliman/scroll-fade-effect (the horizontal mask fade), revamped per D-044 for R4-2 (D-227):
// the critic's accessibility rule for the new chip rails and carousels (Owarine's sideways rails, made reachable) — a
// rail is a named region, takes focus, scrolls with the arrow keys (Home and End jump), and fades only the edge that has
// more (the source fades both, always). Where its items go to another URL (a news symbol strip, a ticker picker), pass `as="nav"` and give
// the current link `aria-current="page"` — not tabs. No motion runtime; reduced motion scrolls without smoothing.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const STEP = 0.8;

export function ScrollRail({ label, as = "region", gapRem, className, children }: { label: string; as?: "region" | "nav"; gapRem?: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft <= 1;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setEdge((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.target !== el) return;
    const smooth = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const by = el.clientWidth * STEP;
    const to = e.key === "ArrowRight" ? el.scrollLeft + by : e.key === "ArrowLeft" ? el.scrollLeft - by : e.key === "Home" ? 0 : e.key === "End" ? el.scrollWidth : null;
    if (to === null) return;
    e.preventDefault();
    el.scrollTo({ left: to, behavior: smooth });
  };

  const props = {
    ref,
    tabIndex: 0,
    "aria-label": label,
    "data-at-start": edge.start ? "" : undefined,
    "data-at-end": edge.end ? "" : undefined,
    className: cn("kit-rail", className),
    style: gapRem === undefined ? undefined : ({ "--kit-gap": `${gapRem}rem` } as CSSProperties),
    onKeyDown: onKey,
  };
  return as === "nav" ? <nav {...props}>{children}</nav> : <div role="region" {...props}>{children}</div>;
}
