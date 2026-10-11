"use client";
// From 21st.dev 26650 shadcnspace/button-group-09 (the follow button group): the toggle and its animated count, revamped
// onto Mitoshi's tokens — "Copy", then "Copying" (or "Fading") that reads "Stop" on hover and focus — with the copier
// count beside it. No avatars: copiers are wallets, and the count is the registry's own.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy, CircleStop, Repeat2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { STRATEGIES } from "./copy";

export interface CopyToggleProps {
  state: "none" | "follow" | "fade";
  copiers: number;
  onCopy: () => void;
  onStop: () => void;
  disabled?: boolean;
  className?: string;
}

export function CopyToggle({ state, copiers, onCopy, onStop, disabled = false, className }: CopyToggleProps) {
  const [hot, setHot] = useState(false);
  const reduce = useReducedMotion();
  const copying = state !== "none";
  const stopping = copying && hot;
  const key = !copying ? "copy" : stopping ? "stop" : "copying";
  const slide = reduce ? {} : { initial: { opacity: 0, y: 5 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -5 }, transition: { duration: 0.15 } };
  const Icon = !copying ? Copy : stopping ? CircleStop : state === "fade" ? Repeat2 : Check;
  const label = !copying ? STRATEGIES.toggle.copy : stopping ? STRATEGIES.toggle.stop : state === "fade" ? STRATEGIES.toggle.fading : STRATEGIES.toggle.copying;
  return (
    <div role="group" className={cn("inline-flex items-stretch overflow-hidden rounded-full border border-hairline", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={copying}
        onClick={(e) => {
          e.stopPropagation();
          if (copying) onStop();
          else onCopy();
        }}
        onPointerEnter={() => setHot(true)}
        onPointerLeave={() => setHot(false)}
        onFocus={() => setHot(true)}
        onBlur={() => setHot(false)}
        className={cn(
          "inline-flex min-h-touch items-center gap-2 px-4 type-body-strong transition-colors disabled:opacity-50",
          !copying && "bg-accent-fill text-on-accent hover:bg-accent-fill-pressed",
          copying && !stopping && "bg-surface-2 text-ink",
          stopping && "bg-loss-wash text-loss",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={key} {...slide} className="inline-flex items-center gap-2">
            <Icon aria-hidden className={cn("size-4 shrink-0", key === "copying" && "text-profit")} />
            <span>{label}</span>
          </motion.span>
        </AnimatePresence>
      </button>
      <span className="inline-flex items-center border-l border-hairline px-3 type-caption text-ink-secondary tabular-nums" aria-label={STRATEGIES.card.copiers(copiers)}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={copiers} {...(reduce ? {} : { initial: { y: -10, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: 10, opacity: 0 }, transition: { duration: 0.18 } })}>
            {copiers}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  );
}
