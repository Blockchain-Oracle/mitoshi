// Ported from Masayume 68f7a09:web/src/components/data/Money.tsx
import { cn } from "@/lib/utils";
import { formatBaseUnits } from "@cwf/core/units";

type MoneyTone = "neutral" | "pnl";

interface MoneyProps {
  value: bigint;
  decimals: number;
  symbol?: string;
  signed?: boolean;
  maxDp?: number;
  /** `pnl` is the only tone allowed to use profit/loss ink (color law). */
  tone?: MoneyTone;
  className?: string;
}

function pnlInk(value: bigint): string {
  if (value > 0n) return "text-profit";
  if (value < 0n) return "text-loss";
  return "text-ink-secondary";
}

export function Money({ value, decimals, symbol, signed = false, maxDp, tone = "neutral", className }: MoneyProps) {
  return (
    <span className={cn("numbers", tone === "pnl" && pnlInk(value), className)}>
      {formatBaseUnits(value, decimals, { signed: signed || tone === "pnl", maxDp })}
      {symbol && <span className="text-ink-secondary"> {symbol}</span>}
    </span>
  );
}
