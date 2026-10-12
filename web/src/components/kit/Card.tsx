// Ported from Owarine 90a91d71:web/src/components/kit/Card.tsx (R4-2, D-227) on Mitoshi's tokens: the card on the stage,
// the feature slab that carries one idea (the balance, a promo, a club) and the small label above a figure.
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A surface card: radius-lg, a hairline, no shadow. `flat` drops the padding for a list inside it. */
export function Card({ className, flat, ...props }: ComponentProps<"div"> & { flat?: boolean }) {
  return <div data-slot="card" data-flat={flat ? "" : undefined} className={cn("kit-card", className)} {...props} />;
}

/** Owarine's pink/sky/lime/cream/black/white, in Mitoshi: accent, surface, profit, cream, the black plate, the card. */
export type FeatureTone = "accent" | "profit" | "surface" | "cream" | "black" | "white";

/** The big rounded slab. The coloured tones hold in both themes (a sticker stays a sticker in the dark). */
export function FeatureCard({ className, tone = "white", ...props }: ComponentProps<"div"> & { tone?: FeatureTone }) {
  return <div data-slot="feature-card" data-tone={tone} className={cn("kit-feature", className)} {...props} />;
}

/** The small label above a figure: muted, never uppercase. */
export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("kit-eyebrow", className)} {...props} />;
}
