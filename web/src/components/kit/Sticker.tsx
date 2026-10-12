// Ported from Owarine 90a91d71:web/src/components/kit/Sticker.tsx (R4-2, D-227) — a die-cut sticker: condensed caps on a
// bright tone with a cream cut line, tilted a few degrees, for the claims Mitoshi makes out loud ("3 FEEDS SIGN IT",
// "PAYS 1.9×"). Tones are the FeatureCard's (Owarine's lime is profit, sky the recessed surface).
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { FeatureTone } from "./Card";

export type StickerTone = FeatureTone;

export function Sticker({ tone = "accent", tilt = -4, icon, size = "md", className, style, children, ...props }: ComponentProps<"span"> & { tone?: StickerTone; tilt?: number; icon?: ReactNode; size?: "sm" | "md" | "lg" }) {
  return (
    <span data-slot="sticker" data-tone={tone} data-size={size} className={cn("kit-sticker", className)} style={{ ...style, rotate: `${tilt}deg` }} {...props}>
      {icon}
      {children}
    </span>
  );
}
