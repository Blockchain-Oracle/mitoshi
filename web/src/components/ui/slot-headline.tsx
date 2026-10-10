"use client";
// From 21st 23414 · yura/slot-headline (21st map, E.1 Landing "Hero"): a headline whose last word sits in a badge and
// rolls like a slot machine. Revamped: Mitoshi's tokens for the badge (hairline border, surface fill), the words are
// the assets a Window runs on, the type comes from the caller (the landing's `type-display`), and the brand-mark list
// is gone. Kept exactly: every row rendered at once (the badge never resizes), a transform-only slide, the seamless
// loop through a trailing copy, the visually hidden current word for screen readers, and reduced motion holding still.
// Classes join as plain strings: `cn` would bring tailwind-merge (~8 KB gzip) onto the landing for nothing to merge.
import { useEffect, useState, type ReactNode } from "react";

/** One row is a touch over 1em tall so descenders are not clipped by the window. */
const ROW_EM = 1.25;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const onChange = () => setReduced(q.matches);
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** `joiner` is the word kept on the badge's line ("on [BTC]"), so a phone never leaves it alone on a line of its own. */
export function SlotHeadline({ prefix, joiner, items, interval = 1900, duration = 600, className }: { prefix: ReactNode; joiner?: string; items: readonly string[]; interval?: number; duration?: number; className?: string }) {
  const rotates = items.length > 1;
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!rotates || reduced) return;
    const id = setInterval(() => setIndex((v) => (v >= items.length ? v : v + 1)), Math.max(duration, interval));
    return () => clearInterval(id);
  }, [rotates, reduced, items.length, interval, duration]);

  useEffect(() => {
    if (index === items.length) {
      // Landed on the trailing copy of the first word: once it settles, snap back with the slide off (no seam).
      const t = setTimeout(() => {
        setAnimate(false);
        setIndex(0);
      }, duration);
      return () => clearTimeout(t);
    }
    if (index === 0 && !animate) {
      const r = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(r);
    }
  }, [index, animate, items.length, duration]);

  const current = items.length ? index % items.length : 0;
  const rows = rotates ? [...items, items[0]!] : items;

  return (
    <h1 className={`flex flex-wrap content-start items-center gap-x-3 gap-y-2${className ? ` ${className}` : ""}`}>
      <span>{prefix}</span>
      <span className="inline-flex items-center gap-x-3 whitespace-nowrap">
        {joiner ? <span>{joiner}</span> : null}
        <span className="inline-flex items-center rounded-2xl border border-hairline bg-surface-1 px-3 py-1 leading-none">
          <span className="sr-only">{items[current]}</span>
          <span className="block overflow-hidden" style={{ height: `${ROW_EM}em` }} aria-hidden="true">
            <span
              className="flex flex-col"
              style={{ transform: `translateY(-${index * ROW_EM}em)`, transition: animate && !reduced ? `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)` : "none" }}
            >
              {rows.map((name, i) => (
                <span key={`${name}-${i}`} className="flex items-center whitespace-nowrap" style={{ height: `${ROW_EM}em` }}>
                  {name}
                </span>
              ))}
            </span>
          </span>
        </span>
      </span>
    </h1>
  );
}
