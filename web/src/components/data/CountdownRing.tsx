// Ported from Masayume 68f7a09:web/src/components/data/CountdownRing.tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const RING_LENGTH = 100;

interface CountdownRingProps {
  /** 1 = full window remaining, 0 = settling. */
  fraction: number;
  urgent?: boolean;
  /** Glow law: only the hero/active card's ring glows, and only while urgent. */
  glow?: boolean;
  className?: string;
  children?: ReactNode;
}

export function CountdownRing({ fraction, urgent = false, glow = false, className, children }: CountdownRingProps) {
  const remaining = Math.min(1, Math.max(0, fraction)) * RING_LENGTH;
  return (
    <div className={cn("relative inline-grid place-items-center rounded-full", glow && urgent && "glow-live", className)}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r="46" pathLength={RING_LENGTH} strokeWidth="6" className="fill-none stroke-hairline" />
        <circle
          cx="50"
          cy="50"
          r="46"
          pathLength={RING_LENGTH}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH - remaining}
          className={cn(
            "fill-none transition-[stroke-dashoffset] duration-1000 ease-linear",
            urgent ? "stroke-accent" : "stroke-ink-secondary",
          )}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
