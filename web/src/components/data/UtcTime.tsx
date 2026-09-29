// Ported from Masayume 68f7a09:web/src/components/data/UtcTime.tsx
import { cn } from "@/lib/utils";
import { formatUtc } from "@cwf/core/units";

interface UtcTimeProps {
  ms: number;
  withSeconds?: boolean;
  withDate?: boolean;
  className?: string;
}

/** Absolute UTC wherever a screenshot can outlive the clock. */
export function UtcTime({ ms, withSeconds = true, withDate = false, className }: UtcTimeProps) {
  return (
    <time dateTime={new Date(ms).toISOString()} className={cn("numbers", className)}>
      {formatUtc(ms, { withSeconds, withDate })}
    </time>
  );
}
