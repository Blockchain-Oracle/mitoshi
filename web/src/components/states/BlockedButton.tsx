"use client";
// Ported from Masayume 68f7a09:web/src/components/states/BlockedButton.tsx

import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { blockerLabel, type BlockerContext, type BlockerKind } from "@/lib/copy";
import { cn } from "@/lib/utils";

export type ButtonTone = "primary" | "up" | "down" | "secondary";

const TONE_CLASSES: Record<ButtonTone, string> = {
  primary: "",
  secondary: "",
  up: "bg-profit text-cream-ink hover:bg-profit/90",
  down: "bg-loss text-cream-ink hover:bg-loss/90",
};

const BLOCKED_CLASSES =
  "border-hairline bg-surface-2 text-ink-disabled opacity-100 disabled:opacity-100 hover:bg-surface-2";

interface BlockedButtonProps extends Omit<ComponentProps<typeof Button>, "disabled" | "children" | "variant"> {
  /** When set, the control is disabled and this blocker IS its label and accessible name. */
  blocker: BlockerKind | null;
  ctx?: BlockerContext;
  tone?: ButtonTone;
  children: ReactNode;
}

/** The one blocked control: a dead control never looks tappable, and always says why. */
export function BlockedButton({ blocker, ctx, tone = "primary", className, children, ...props }: BlockedButtonProps) {
  if (blocker) {
    const label = blockerLabel(blocker, ctx);
    return (
      <Button
        {...props}
        disabled
        aria-disabled="true"
        aria-label={label}
        title={label}
        variant="secondary"
        className={cn(BLOCKED_CLASSES, className)}
      >
        {label}
      </Button>
    );
  }
  return (
    <Button {...props} variant={tone === "secondary" ? "secondary" : "default"} className={cn(TONE_CLASSES[tone], className)}>
      {children}
    </Button>
  );
}
