// Ported from Masayume 68f7a09:web/src/components/data/Odds.tsx
import { cn } from "@/lib/utils";
import { bpsToOddsCents } from "@cwf/core/units";

interface OddsProps {
  bps: number;
  className?: string;
}

export function Odds({ bps, className }: OddsProps) {
  const cents = bpsToOddsCents(bps);
  return (
    <span className={cn("numbers", className)} aria-label={`${cents} cents per dollar`}>
      {cents}¢
    </span>
  );
}
