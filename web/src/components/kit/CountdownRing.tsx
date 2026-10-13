"use client";
// Ported from Owarine 90a91d71:web/src/components/kit/CountdownRing.tsx (R4-2, D-227) — time left in a Window as a
// draining ring with the time inside, ticking on its own; the ring turns accent in the last tenth so the close never
// sneaks up. Mitoshi draws it on the one ring face (components/data/CountdownRing, Masayume's, which a caller with its
// own fraction still uses) and on the chain-corrected clock (lib/clock `useNowMs`), so every countdown reads the same
// second. `role="timer"` is never live: a ticking figure is not announced (critic gap 20).
import { CountdownRing as RingFace } from "@/components/data/CountdownRing";
import { SHELL } from "@/lib/copy";
import { useNowMs } from "@/lib/clock";
import { cn } from "@/lib/utils";

/** "42s" · "4:05" · "2h" — short enough for the inside of a 44 px ring. */
export function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}h`;
  if (s >= 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return `${s}s`;
}

export interface CountdownRingProps {
  /** The Window's open and close, in ms (the chain's clock). */
  startMs: number;
  endMs: number;
  /** sm 28 px (a chip), md 44 px, lg 64 px (a featured card). */
  size?: "sm" | "md" | "lg";
  /** Only the hero or active card's ring glows, and only while urgent (the face's glow law). */
  glow?: boolean;
  className?: string;
}

export function CountdownRing({ startMs, endMs, size = "md", glow = false, className }: CountdownRingProps) {
  const now = useNowMs();
  const span = Math.max(1, endMs - startMs);
  // The clock reads 0 on the server and before its first tick: a full ring then, never an empty one.
  const left = now === 0 ? span : Math.max(0, endMs - now);
  const fraction = Math.min(1, left / span);
  const text = formatLeft(left);
  return (
    <span role="timer" aria-label={SHELL.timeLeft(text)} data-slot="countdown-ring" data-size={size} className={cn("kit-ring", className)}>
      <RingFace fraction={fraction} urgent={fraction < 0.1} glow={glow} className="size-full">
        <span aria-hidden className="kit-ring-left">{text}</span>
      </RingFace>
    </span>
  );
}
