// Ported from Owarine 90a91d71:web/src/components/ui/desk-kit/timeline.tsx (R4-2, D-227) — the desk kit's sequences,
// adapted there from 21st (Interactive Timeline #28276 and Agent Activity #29318 for the record, Onboarding Steps with
// Progress #29458 for the studio, Empty State #1435), here on Mitoshi's tokens. The rise-in and the progress line are
// CSS (no motion runtime); reduced motion shows them at once.
import { Check } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NodeTone = "acted" | "declined" | "quiet" | "asked" | "stopped" | "error" | "neutral";

/** A vertical rail of nodes; children are `TimelineNode`s and `TimelineDay` labels. Entries rise in, one after another. */
export function Timeline({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <ol className={cn("dkit-timeline", className)} aria-label={label}>
      {children}
    </ol>
  );
}

export function TimelineDay({ children }: { children: ReactNode }) {
  return <li className="dkit-timeline-day">{children}</li>;
}

export function TimelineNode({ icon, tone, index = 0, children, className }: { icon: ReactNode; tone: NodeTone; index?: number; children: ReactNode; className?: string }) {
  return (
    <li className={cn("dkit-timeline-node", className)} data-tone={tone} style={{ "--dkit-i": Math.min(index, 10) } as CSSProperties}>
      <span className="dkit-timeline-icon" aria-hidden>{icon}</span>
      <div className="dkit-timeline-body">{children}</div>
    </li>
  );
}

export interface StepItem {
  label: string;
  hint?: string;
}

/** Numbered steps joined by a progress line; done steps show a check and can be revisited, later ones cannot. */
export function StepProgress({ steps, current, onPick, label }: { steps: readonly StepItem[]; current: number; onPick: (step: number) => void; label: string }) {
  const fraction = steps.length > 1 ? (current - 1) / (steps.length - 1) : 0;
  return (
    <nav className="dkit-steps" aria-label={label} style={{ "--dkit-steps": steps.length } as CSSProperties}>
      <div className="dkit-steps-rail" aria-hidden>
        <span className="dkit-steps-rail-fill" style={{ scale: `${fraction} 1` }} />
      </div>
      <ol>
        {steps.map((s, i) => {
          const n = i + 1;
          const state = n < current ? "done" : n === current ? "current" : "next";
          return (
            <li key={s.label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <button type="button" disabled={state !== "done"} onClick={() => onPick(n)}>
                <span className="dkit-step-badge">{state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : n}</span>
                <span className="dkit-step-text">
                  <span className="dkit-step-label">{s.label}</span>
                  {s.hint ? <span className="dkit-step-hint">{s.hint}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** A calm empty state: a mark, a line, a sentence and an optional action. */
export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="dkit-empty">
      <span className="dkit-empty-icon" aria-hidden>{icon}</span>
      <p className="dkit-empty-title">{title}</p>
      {body ? <p className="dkit-empty-body">{body}</p> : null}
      {action}
    </div>
  );
}
