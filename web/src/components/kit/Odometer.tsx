"use client";
// Ported from Owarine 90a91d71:web/src/components/kit/Odometer.tsx (R4-1/R4-2, D-227) — rolling digits for a live figure
// on NumberFlow, on Mitoshi's tokens: the sign tones are the chart's up/down (vermilion stays the accent), the numerals
// the data face. Display only: the money stays in bigints upstream and arrives as a plain number for the view. Always
// en-US, so "$" never reads "US$" (R4-0). A ticking figure is never inside an aria-live region (D-227 accessibility):
// state changes are announced once through the page's live region, not on every tick. NumberFlow honours reduced motion.
import NumberFlow, { type Format } from "@number-flow/react";
import { cn } from "@/lib/utils";

/** `usd` $1,234.56 · `pnl` +$12.34 signed and toned · `pct` +4.20% (a percent value: 4.2 → 4.20%) · `plain` 1,234. */
export type OdometerKind = "usd" | "pnl" | "pct" | "plain";

export interface OdometerProps {
  value: number;
  kind?: OdometerKind;
  decimals?: number;
  /** For `usd`/`plain`, a `+` on positive values; `pnl` and `pct` are always signed. */
  signed?: boolean;
  /** Tone by sign (`pnl` and `pct` do by default). */
  tone?: boolean;
  /** Tradash's rule: zero reads as up (`+$0.00`, the up tone), never unsigned grey. */
  zeroIsUp?: boolean;
  className?: string;
}

// Tradash's digit roll: 260 ms — a live figure can change several times a second; a long spin would always be mid-roll.
const TIMING = { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" } as const;

export const directionOf = (value: number): "up" | "down" | "flat" => (value > 0 ? "up" : value < 0 ? "down" : "flat");

export function Odometer({ value, kind = "usd", decimals, signed, tone, zeroIsUp, className }: OdometerProps) {
  const dp = decimals ?? (kind === "plain" ? 0 : 2);
  const isSigned = kind === "pnl" || kind === "pct" || signed === true;
  const colour = tone ?? (kind === "pnl" || kind === "pct");
  const safe = Number.isFinite(value) ? value : 0;
  const format: Format = {
    ...(kind === "usd" || kind === "pnl" ? { style: "currency", currency: "USD" } : kind === "pct" ? { style: "percent" } : {}),
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
    signDisplay: isSigned ? (zeroIsUp ? "always" : "exceptZero") : "auto",
  };
  const dir = zeroIsUp && safe === 0 ? "up" : directionOf(safe);
  return (
    <span data-slot="odometer" data-dir={colour && dir !== "flat" ? dir : undefined} className={cn("odometer", className)}>
      <NumberFlow locales="en-US" value={kind === "pct" ? safe / 100 : safe} format={format} transformTiming={TIMING} spinTiming={TIMING} willChange />
    </span>
  );
}
