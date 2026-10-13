// Ported from Owarine 90a91d71:web/src/components/kit/PillButton.tsx (R4-2, D-227) — UGLYCASH's buttons on Mitoshi's
// tokens: always a pill, never a shadow. Accent (vermilion) is THE action on a screen, one per view; ink is the default
// action; white sits on the stage; ghost sits on a card; up and down wear the ticket's UP/DOWN washes. `sm` is 36 px
// with a 44 px hit area, `md` 48, `lg` the ticket CTA's 52. Pressing sinks the pill slightly (not under reduced motion).
// `pillButtonVariants` gives a Link the same look.
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const pillButtonVariants = cva("kit-pill", {
  variants: {
    tone: { accent: "kit-pill--accent", ink: "kit-pill--ink", white: "kit-pill--white", ghost: "kit-pill--ghost", up: "kit-pill--up", down: "kit-pill--down" },
    size: { sm: "kit-pill--sm", md: "kit-pill--md", lg: "kit-pill--lg", icon: "kit-pill--icon" },
    block: { true: "kit-pill--block", false: "" },
  },
  defaultVariants: { tone: "ink", size: "md", block: false },
});

export type PillTone = NonNullable<VariantProps<typeof pillButtonVariants>["tone"]>;
export type PillButtonProps = ButtonPrimitive.Props & VariantProps<typeof pillButtonVariants>;

export function PillButton({ className, tone, size, block, nativeButton, ...props }: PillButtonProps) {
  return <ButtonPrimitive data-slot="pill-button" nativeButton={nativeButton ?? props.render === undefined} className={cn(pillButtonVariants({ tone, size, block }), className)} {...props} />;
}
