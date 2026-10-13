// The kit pill's look (R4-2, D-227), split from PillButton (R6, D-230) so a plain <button> or link can wear it without
// Base UI's button: the always-loaded states, CTAs and toasts use `Pill` (route budgets), everything else PillButton.
import { cva, type VariantProps } from "class-variance-authority";
import "./pill.css";

export const pillButtonVariants = cva("kit-pill", {
  variants: {
    tone: { accent: "kit-pill--accent", ink: "kit-pill--ink", white: "kit-pill--white", ghost: "kit-pill--ghost", up: "kit-pill--up", down: "kit-pill--down", "up-fill": "kit-pill--up-fill", "down-fill": "kit-pill--down-fill" },
    size: { sm: "kit-pill--sm", md: "kit-pill--md", lg: "kit-pill--lg", icon: "kit-pill--icon" },
    block: { true: "kit-pill--block", false: "" },
  },
  defaultVariants: { tone: "ink", size: "md", block: false },
});

export type PillTone = NonNullable<VariantProps<typeof pillButtonVariants>["tone"]>;
export type PillLook = VariantProps<typeof pillButtonVariants>;
