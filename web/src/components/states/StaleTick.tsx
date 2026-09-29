// Ported from Masayume 68f7a09:web/src/components/states/StaleTick.tsx — the ux-audit fixes: the time is the reader's
// local time (it was UTC), and a tick is no longer its own `aria-live` region (every tick announced itself); the
// screen's one `LiveRegion` announces staleness transitions instead.
import type { StaleReason } from "@cwf/core";
import { TriangleAlertIcon } from "lucide-react";
import { STALE_REASON_LABEL, staleLine } from "@/lib/copy";
import { cn } from "@/lib/utils";

interface StaleTickProps {
  asOfMs: number;
  reason?: StaleReason;
  compact?: boolean;
  className?: string;
}

const LOCAL_TIME = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export function localClock(ms: number): string {
  return LOCAL_TIME.format(new Date(ms));
}

/** The previous value stays at full ink; this tick says how old it is, in the reader's own clock. */
export function StaleTick({ asOfMs, reason = "refresh-failed", compact = false, className }: StaleTickProps) {
  const reasonLabel = STALE_REASON_LABEL[reason];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-warning type-caption", className)}>
      <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
      {compact ? reasonLabel : staleLine(localClock(asOfMs), reasonLabel)}
    </span>
  );
}
