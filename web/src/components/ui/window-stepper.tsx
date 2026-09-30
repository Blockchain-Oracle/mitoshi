"use client";
// From 21st.dev 29940 arihantcodes_1f7b8c4d/quantity-stepper — revamped per D-044 into the slip's per-leg stepper
// (E.4 "29940 per leg"): instead of a quantity it steps a leg through the live Windows of its lane (earlier ‹ › later),
// the label rolling in the direction of travel. Kept: the ARIA spinbutton (arrow keys, Home/End), the boundary shake
// and its polite announcement, the press squish. Changed: framer-motion → `m.*` under the island's LazyMotion, no
// hold-to-repeat (a Window is a deliberate choice), 44 px buttons (the source's 32 px failed §2.5), tokens instead of
// zinc/rose, and under reduced motion the label swaps and nothing shakes.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, m, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface StepperOption {
  id: string;
  /** What the pill shows (e.g. "BTC 5m · 07:25"). */
  label: string;
  /** What a screen reader hears. */
  valueText: string;
}

export interface WindowStepperProps {
  options: readonly StepperOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  /** Said when a press is blocked at an end (e.g. "No earlier Window"). */
  firstText: string;
  lastText: string;
  className?: string;
}

const SHAKE = [0, -4, 4, -2, 2, 0];

export function WindowStepper({ options, value, onChange, label, firstText, lastText, className }: WindowStepperProps) {
  const reduce = useReducedMotion() === true;
  const shake = useAnimationControls();
  const [direction, setDirection] = useState(1);
  const [said, setSaid] = useState("");
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const current = options[index];

  useEffect(() => {
    if (!said) return;
    const id = setTimeout(() => setSaid(""), 1_500);
    return () => clearTimeout(id);
  }, [said]);

  const step = (delta: number) => {
    const next = options[index + delta];
    if (!next) {
      setSaid(delta < 0 ? firstText : lastText);
      if (!reduce) void shake.start({ x: SHAKE, transition: { duration: 0.3 } });
      return;
    }
    setDirection(delta);
    onChange(next.id);
  };
  const onKey = (e: KeyboardEvent) => {
    const map: Record<string, number | undefined> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, Home: -index, End: options.length - 1 - index };
    const delta = map[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    if (delta !== 0) step(delta);
  };

  return (
    <div className={cn("flex min-h-touch items-center gap-1 rounded-full border border-hairline bg-surface-2 p-0.5", className)}>
      <m.button type="button" aria-label={`${label}: earlier`} onClick={() => step(-1)} whileTap={reduce ? undefined : { scale: 0.9 }} className="grid size-touch shrink-0 place-items-center rounded-full text-ink-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
        <ChevronLeft aria-hidden className="size-4" />
      </m.button>
      <m.div
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={options.length}
        aria-valuetext={current?.valueText ?? ""}
        onKeyDown={onKey}
        animate={shake}
        className="relative flex min-w-0 flex-1 justify-center overflow-hidden rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
      >
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <m.span
            key={current?.id ?? "none"}
            custom={direction}
            initial={reduce ? { opacity: 0 } : { y: direction * 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: direction * -12, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="numbers truncate type-data text-ink"
          >
            {current?.label ?? "—"}
          </m.span>
        </AnimatePresence>
      </m.div>
      <m.button type="button" aria-label={`${label}: later`} onClick={() => step(1)} whileTap={reduce ? undefined : { scale: 0.9 }} className="grid size-touch shrink-0 place-items-center rounded-full text-ink-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
        <ChevronRight aria-hidden className="size-4" />
      </m.button>
      <span role="status" aria-live="polite" className="sr-only">{said}</span>
    </div>
  );
}
