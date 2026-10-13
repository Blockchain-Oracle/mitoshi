"use client";
// From 21st.dev 23569 ddoemonn/task-steps — revamped per D-044 (R4-12, D-227): each step carries its own status (a
// bridge leg can be stuck while the next waits, so one `current` index isn't enough), plus `skipped` for a chain that
// isn't live; Mitoshi tones instead of stone/emerald; lucide marks popped in with `m.*` under the app's LazyMotion
// (instant under reduced motion); a horizontal `row` layout for the reserves re-check; one polite sentence for screen
// readers (the component's own announcement rule).
import { Check, Minus, X } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type TaskStepStatus = "pending" | "active" | "done" | "error" | "skipped";

export interface TaskStep {
  id: string;
  label: string;
  status: TaskStepStatus;
  /** A short trailing figure: a time, a block, a link. */
  meta?: React.ReactNode;
}

const POP = { type: "spring", stiffness: 640, damping: 22, mass: 0.7 } as const;

function Mark({ status, reduced }: { status: TaskStepStatus; reduced: boolean }) {
  const icon = status === "done" ? <Check aria-hidden className="size-3" /> : status === "error" ? <X aria-hidden className="size-3" /> : status === "skipped" ? <Minus aria-hidden className="size-3" /> : null;
  return (
    <span className="tsteps-mark" data-status={status}>
      <AnimatePresence initial={false} mode="popLayout">
        {icon ? (
          <m.span key={status} className="tsteps-icon" initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={reduced ? { duration: 0 } : POP}>
            {icon}
          </m.span>
        ) : status === "active" ? (
          <span key="active" className="tsteps-spin motion-reduce:animate-none" />
        ) : (
          <span key="pending" className="tsteps-dot" />
        )}
      </AnimatePresence>
    </span>
  );
}

export function TaskSteps({ steps, label, layout = "column", className }: { steps: readonly TaskStep[]; label: string; layout?: "column" | "row"; className?: string }) {
  const reduced = useReducedMotion() === true;
  const active = steps.find((s) => s.status === "active" || s.status === "error");
  const done = steps.filter((s) => s.status === "done").length;
  const sentence = active ? `${active.label}: ${active.status === "error" ? "failed" : "in progress"}` : `${done} of ${steps.length} done`;
  return (
    <div className={cn("tsteps", className)} data-layout={layout}>
      <ol aria-label={label} className="tsteps-list">
        {steps.map((s) => (
          <li key={s.id} className="tsteps-row" data-status={s.status} aria-current={s.status === "active" ? "step" : undefined}>
            <Mark status={s.status} reduced={reduced} />
            <span className="tsteps-label">{s.label}</span>
            {s.meta ? <span className="tsteps-meta">{s.meta}</span> : null}
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">{sentence}</p>
    </div>
  );
}
