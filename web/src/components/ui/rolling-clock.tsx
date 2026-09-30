"use client";
/**
 * From 21st.dev 19328 nexus-ui/animated-countdown — its "minimal" variant's `CountdownNumber`, revamped per D-044: the
 * digits of Masayume's `m:ss` roll up as each second passes (JetBrains Mono, tabular) under `m.*` in the app's
 * LazyMotion, a plain swap under reduced motion; the host keeps the clock (the shared leaf clock, ux-audit fix 12) and
 * the single polite announcement. Headline clocks only (the hero, the ticket head) — lists tick plain text.
 */
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

function Group({ value, reduce }: { value: string; reduce: boolean }) {
  return (
    <span className="relative inline-grid place-items-center overflow-hidden tabular-nums">
      <AnimatePresence initial={false} mode="popLayout">
        <m.span
          key={value}
          initial={reduce ? false : { y: "0.6em", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: "-0.6em", opacity: 0 }}
          transition={{ duration: reduce ? 0.05 : 0.25, ease: "easeOut" }}
        >
          {value}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

/** `text` is the formatted clock ("4:07", "1:02:09", "Settling…"); each colon-separated group rolls on its own. */
export function RollingClock({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion() === true;
  const groups = /^\d[\d:]*$/.test(text) ? text.split(":") : null;
  return (
    <span role="timer" className={cn("numbers inline-flex items-baseline", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex items-baseline">
        {groups ? groups.map((g, i) => <span key={i} className="inline-flex">{i > 0 ? ":" : null}<Group value={g} reduce={reduce} /></span>) : text}
      </span>
    </span>
  );
}
