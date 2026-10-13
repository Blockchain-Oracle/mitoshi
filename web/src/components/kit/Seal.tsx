// Ported in role from Owarine 90a91d71:web/src/components/kit/Seal.tsx (R4-2, D-227) — Owarine stamps its 終値 hanko;
// Mitoshi's seal is its 見通し mark in a disc (the dock's centre seal, components/shell/MobileDock). `stamp` plays a
// one-shot press when it mounts (a scale down, a small overshoot), not under reduced motion.
import { cn } from "@/lib/utils";
import MitoshiMark from "../shell/MitoshiMark";

export function Seal({ size = "md", tone = "accent", stamp, tilt = -6, title, className }: { size?: "sm" | "md" | "lg"; tone?: "accent" | "ink" | "stage"; stamp?: boolean; tilt?: number; title?: string; className?: string }) {
  return (
    <span data-slot="seal" data-size={size} data-tone={tone} data-stamp={stamp ? "" : undefined} className={cn("kit-seal", className)} style={{ rotate: `${tilt}deg` }}>
      <MitoshiMark title={title} />
    </span>
  );
}
