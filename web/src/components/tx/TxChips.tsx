/** Signing → Sent → Confirmed, as the lifecycle moves (D-052). Each chip carries its state in words, not colour alone. */
import type { TxState } from "@cwf/core";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { TX } from "./copy";

const ORDER = ["signing", "submitted", "confirmed"] as const;

function reached(state: TxState): number {
  switch (state.kind) {
    case "signing":
      return 0;
    case "submitted":
    case "unknown":
      return 1;
    case "confirmed":
      return state.pending ? 1 : 2;
    default:
      return -1;
  }
}

export function TxChips({ state, className }: { state: TxState; className?: string }) {
  const at = reached(state);
  if (at < 0) return null;
  return (
    <ol className={cn("flex items-center gap-2", className)} aria-label="Progress">
      {ORDER.map((step, i) => {
        const done = i < at || (i === at && step === "confirmed");
        const current = i === at && !done;
        return (
          <li key={step} className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 type-caption", done ? "border-border-strong text-ink" : current ? "border-accent text-ink" : "border-hairline text-ink-secondary")} aria-current={current ? "step" : undefined}>
            {done ? <Check aria-hidden className="size-3.5" /> : <span aria-hidden className={cn("size-1.5 rounded-full", current ? "bg-accent motion-safe:animate-pulse" : "bg-ink-disabled")} />}
            {TX.chips[step === "submitted" ? "submitted" : step]}
          </li>
        );
      })}
    </ol>
  );
}
