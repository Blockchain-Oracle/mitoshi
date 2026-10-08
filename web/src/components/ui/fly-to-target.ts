"use client";
// From 21st.dev 24524 motiondotdev/motion-add-to-basket — revamped per D-044 into the parlay's "add a leg" arc (E.4
// "24524 add arc"): the source's quadratic arc mixer (control point off the chord, cw by default) and its easing are
// kept; the shoe tile becomes a small chip naming the leg ("BTC ▲"), flown from the tapped row to the slip (the rail's
// leg count, or the dock button below `lg`), which then gives the source's spring "ping". Changed: no product card or
// basket markup (the host owns both ends), no React state per flight (one detached, aria-hidden node), transforms and
// opacity only, and under reduced motion nothing flies — the target only pulses once.
import { animate } from "motion/react";
import { useCallback } from "react";
import { useReducedMotion } from "motion/react";

type Point = { x: number; y: number };

function quadratic(t: number, p0: number, p1: number, p2: number): number {
  const rest = 1 - t;
  return rest * rest * p0 + 2 * rest * t * p1 + t * t * p2;
}

/** The source's `controlPoint`: `peak` along the chord, pushed `strength` of its length to one side (cw). */
function arcPath(from: Point, to: Point, strength = 0.5, peak = 0.15): (t: number) => Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const c = len > 0 ? { x: from.x + dx * peak + (dy / len) * strength * len, y: from.y + dy * peak - (dx / len) * strength * len } : from;
  return (t) => ({ x: quadratic(t, from.x, c.x, to.x), y: quadratic(t, from.y, c.y, to.y) });
}

function pulse(target: Element): void {
  void animate(target, { scale: [1, 1.12, 1] }, { duration: 0.35, ease: "easeOut" });
}

/** Returns `fly(fromEl, toEl, label)`: a chip travels the arc from one element's centre to the other's, then the target pings. */
export function useFlyToTarget(): (from: Element | null, to: Element | null, label: string) => Promise<void> {
  const reduce = useReducedMotion() === true;
  return useCallback(
    async (from, to, label) => {
      if (!to) return;
      if (reduce || !from) {
        pulse(to);
        return;
      }
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const chip = document.createElement("span");
      chip.className = "fly-chip";
      chip.textContent = label;
      chip.setAttribute("aria-hidden", "true");
      chip.style.left = `${a.left + a.width / 2}px`;
      chip.style.top = `${a.top + a.height / 2}px`;
      document.body.appendChild(chip);
      const path = arcPath({ x: 0, y: 0 }, { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) });
      try {
        await animate(0, 1, {
          duration: 0.45,
          ease: [0.74, 0.18, 0.93, 0.69],
          onUpdate: (t) => {
            const p = path(t);
            chip.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px) scale(${1 - 0.45 * t})`;
            chip.style.opacity = t < 0.9 ? "1" : String(1 - (t - 0.9) / 0.1);
          },
        });
      } finally {
        chip.remove();
      }
      pulse(to);
    },
    [reduce],
  );
}
