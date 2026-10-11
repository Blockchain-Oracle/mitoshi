"use client";
// From 21st.dev 23576 ddoemonn/wizard-steps: the progress rail (numbered tiles that turn to checks, a filling track),
// direction-aware panel transitions and arrow-key navigation, revamped onto Mitoshi's tokens. The panel grows with its
// content (no fixed height), "Next" carries the step's own blocker instead of a silent disabled state, and the last
// step owns its action (publishing is a transaction, not a "Finish" click).
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: string;
  label: string;
  content: ReactNode;
  /** Why this step can't advance yet; null when it can. */
  blocker: string | null;
}

const RAIL = { type: "spring", stiffness: 520, damping: 40, mass: 0.5 } as const;
const CROSSFADE = { type: "spring", stiffness: 260, damping: 34, mass: 0.8 } as const;

export function StudioWizard({ steps, label, backLabel = "Back", nextLabel = "Next" }: { steps: WizardStep[]; label: string; backLabel?: string; nextLabel?: string }) {
  const [at, setAt] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [furthest, setFurthest] = useState(0);
  const reduced = useReducedMotion();
  const listRef = useRef<HTMLOListElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const intent = useRef<"list" | "panel" | null>(null);
  const goTo = (to: number) => {
    const target = Math.max(0, Math.min(steps.length - 1, to));
    if (target === at) return;
    setDirection(target > at ? 1 : -1);
    setAt(target);
    setFurthest((f) => Math.max(f, target));
  };
  useEffect(() => {
    const move = intent.current;
    intent.current = null;
    if (move === "list") listRef.current?.querySelector<HTMLButtonElement>('button[data-current="true"]')?.focus();
    else if (move === "panel") panelRef.current?.focus({ preventScroll: true });
  }, [at]);
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    let target = at;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") target = at + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") target = at - 1;
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = furthest;
    else return;
    e.preventDefault();
    target = Math.min(Math.max(0, target), furthest);
    if (target === at) return;
    intent.current = "list";
    goTo(target);
  };
  const step = steps[at]!;
  const isLast = at === steps.length - 1;
  const variants = {
    enter: (d: 1 | -1) => (reduced ? { opacity: 0 } : { opacity: 0, x: d * 22 }),
    center: reduced ? { opacity: 1 } : { opacity: 1, x: 0 },
    exit: (d: 1 | -1) => (reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: d * -22, transition: { duration: 0.14 } }),
  };
  return (
    <div className="flex w-full flex-col gap-4">
      <p aria-live="polite" className="sr-only">{`Step ${at + 1} of ${steps.length}: ${step.label}`}</p>
      <ol ref={listRef} aria-label={label} className="flex list-none items-center gap-1 p-0">
        {steps.map((s, i) => {
          const done = i < at;
          const here = i === at;
          const tile = (
            <motion.span
              aria-hidden
              className={cn(
                "grid size-8 place-items-center rounded-md border type-caption tabular-nums transition-colors",
                done ? "border-ink bg-ink text-ground" : here ? "border-ink bg-surface-1 text-ink" : "border-hairline bg-surface-1 text-ink-muted",
              )}
              initial={false}
              animate={{ scale: here ? 1 : 0.92 }}
              transition={reduced ? { duration: 0 } : RAIL}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </motion.span>
          );
          return (
            <li key={s.id} className="flex flex-1 items-center gap-1 last:flex-none">
              {i <= furthest ? (
                <button
                  type="button"
                  data-current={here ? "true" : undefined}
                  tabIndex={here ? 0 : -1}
                  aria-current={here ? "step" : undefined}
                  aria-label={`Step ${i + 1} of ${steps.length}: ${s.label}`}
                  onKeyDown={onKey}
                  onClick={() => {
                    if (here) return;
                    intent.current = "list";
                    goTo(i);
                  }}
                  className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {tile}
                </button>
              ) : (
                <span>
                  <span className="sr-only">{`Step ${i + 1} of ${steps.length}: ${s.label}`}</span>
                  {tile}
                </span>
              )}
              {i < steps.length - 1 ? (
                <span aria-hidden className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <motion.span className="absolute inset-0 origin-left rounded-full bg-ink" initial={false} animate={{ scaleX: i < at ? 1 : 0 }} transition={reduced ? { duration: 0 } : RAIL} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <h2 className="type-title text-ink">{step.label}</h2>
      <div ref={panelRef} tabIndex={-1} role="group" aria-label={step.label} className="relative overflow-hidden rounded-lg border border-hairline bg-surface-1 outline-none focus-visible:border-ink">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div key={step.id} custom={direction} variants={variants} initial="enter" animate="center" exit="exit" transition={reduced ? { duration: 0 } : CROSSFADE} className="p-5">
            {step.content}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {at > 0 && (
          <button
            type="button"
            onClick={() => {
              intent.current = "panel";
              goTo(at - 1);
            }}
            className="min-h-touch rounded-full border border-hairline px-5 type-body-strong text-ink hover:bg-surface-2"
          >
            {backLabel}
          </button>
        )}
        {!isLast && (
          <button
            type="button"
            disabled={step.blocker !== null}
            onClick={() => {
              intent.current = "panel";
              goTo(at + 1);
            }}
            className="min-h-touch rounded-full bg-accent-fill px-6 type-body-strong text-on-accent hover:bg-accent-fill-pressed disabled:opacity-50"
          >
            {nextLabel}
          </button>
        )}
        {!isLast && step.blocker && <span role="status" className="type-caption text-ink-secondary">{step.blocker}</span>}
      </div>
    </div>
  );
}
