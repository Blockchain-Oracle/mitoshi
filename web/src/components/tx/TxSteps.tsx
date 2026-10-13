/**
 * Signing → Sent → Confirmed under every TxCta (D-052; R6 T12): TaskSteps (From 21st.dev 23569 ddoemonn/task-steps)
 * in its compact row, mapped from the lifecycle. Each step says its state in words and a mark, not colour alone. The
 * lifecycle already announces itself (`useTxLifecycle`), so the row stays quiet for screen readers.
 */
import type { TxState } from "@cwf/core";
import { TaskSteps, type TaskStep, type TaskStepStatus } from "@/components/ui/task-steps";
import { TX } from "./copy";

const ORDER = ["signing", "submitted", "confirmed"] as const;

/** How far the write got: 0 signing, 1 sent (or unknown), 2 confirmed; -1 when nothing is in flight. */
export function txReached(state: TxState): number {
  switch (state.kind) {
    case "signing":
      return 0;
    case "submitted":
    case "unknown":
      return 1;
    case "confirmed":
      return 2;
    default:
      return -1;
  }
}

export function txStepsOf(state: TxState): TaskStep[] | null {
  const at = txReached(state);
  if (at < 0) return null;
  return ORDER.map((step, i) => {
    const status: TaskStepStatus = i < at || (i === at && step === "confirmed") ? "done" : i === at ? "active" : "pending";
    return { id: step, label: TX.chips[step], status };
  });
}

export function TxSteps({ state, className }: { state: TxState; className?: string }) {
  const steps = txStepsOf(state);
  if (!steps) return null;
  return <TaskSteps steps={steps} label={TX.progress} size="compact" announce={false} className={className} />;
}
