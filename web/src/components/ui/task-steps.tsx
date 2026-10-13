"use client";
// From 21st.dev 23569 ddoemonn/task-steps — revamped per D-044 (R4-12, D-227): each step carries its own status (one
// step can be stuck while the next waits, so one `current` index isn't enough), plus `skipped` for a chain that isn't
// live; Mitoshi tones instead of stone/emerald; a horizontal `row` layout; one polite sentence for screen readers (the
// component's own announcement rule). R6 (D-230): the marks pop in by CSS keyframe (`styles/state-kit.css`
// `tsteps-pop`), not `m.*` — outside a motion scope an `m.*` stays at its `initial`, which is how a done check never
// appeared — and `size="compact"` is the 20 px Signing · Sent · Confirmed row under every TxCta.
import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TaskStepStatus = "pending" | "active" | "done" | "error" | "skipped";

export interface TaskStep {
  id: string;
  label: string;
  status: TaskStepStatus;
  /** A short trailing figure: a time, a block, a link. */
  meta?: React.ReactNode;
}

function Mark({ status }: { status: TaskStepStatus }) {
  const icon = status === "done" ? <Check aria-hidden className="size-3" /> : status === "error" ? <X aria-hidden className="size-3" /> : status === "skipped" ? <Minus aria-hidden className="size-3" /> : null;
  return (
    <span className="tsteps-mark" data-status={status}>
      {icon ? (
        // Keyed by status, so a step that turns done pops its mark in once.
        <span key={status} className="tsteps-icon">{icon}</span>
      ) : status === "active" ? (
        <span key="active" className="tsteps-spin" />
      ) : (
        <span key="pending" className="tsteps-dot" />
      )}
    </span>
  );
}

export interface TaskStepsProps {
  steps: readonly TaskStep[];
  label: string;
  layout?: "column" | "row";
  /** `compact`: one 20 px row (the TxCta's caption slot). */
  size?: "regular" | "compact";
  /** Speak the progress sentence (off where the host already announces its lifecycle). */
  announce?: boolean;
  className?: string;
}

export function TaskSteps({ steps, label, layout = "column", size = "regular", announce = true, className }: TaskStepsProps) {
  const active = steps.find((s) => s.status === "active" || s.status === "error");
  const done = steps.filter((s) => s.status === "done").length;
  const sentence = active ? `${active.label}: ${active.status === "error" ? "failed" : "in progress"}` : `${done} of ${steps.length} done`;
  return (
    <div className={cn("tsteps", className)} data-layout={size === "compact" ? "row" : layout} data-size={size}>
      <ol aria-label={label} className={cn("tsteps-list", size === "compact" ? "type-caption-sm" : "type-caption")}>
        {steps.map((s) => (
          <li key={s.id} className="tsteps-row" data-status={s.status} aria-current={s.status === "active" ? "step" : undefined}>
            <Mark status={s.status} />
            <span className="tsteps-label">{s.label}</span>
            {s.meta ? <span className="tsteps-meta type-data-sm">{s.meta}</span> : null}
          </li>
        ))}
      </ol>
      {announce ? <p className="sr-only" aria-live="polite">{sentence}</p> : null}
    </div>
  );
}
