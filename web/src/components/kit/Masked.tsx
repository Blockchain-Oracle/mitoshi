"use client";
// Ported in role from Owarine 90a91d71:web/src/components/kit/PrivacyMask.tsx (R4-2, D-227): wrap any money figure; with
// privacy mode on (lib/privacy, the balance eye) the figure is replaced by `SHELL.masked`, so the real value is not in the
// DOM for a screenshot to catch, on every surface — not only the terminal and the portfolio. Owarine's sticker art is
// not ported; Mitoshi masks with its dots.
import { Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { SHELL } from "@/lib/copy";
import { setPrivacy, usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";

export function Masked({ children, className }: { children: ReactNode; className?: string }) {
  const hidden = usePrivacy();
  if (!hidden) return <>{children}</>;
  return (
    <span data-slot="masked" className={cn("kit-masked", className)} role="img" aria-label={SHELL.privacyHidden}>
      {SHELL.masked}
    </span>
  );
}

/** The eye that flips privacy mode, placed beside a balance. */
export function PrivacyToggle({ className }: { className?: string }) {
  const hidden = usePrivacy();
  const label = hidden ? SHELL.privacyShow : SHELL.privacyHide;
  return (
    <button type="button" className={cn("kit-privacy", className)} aria-pressed={hidden} aria-label={label} title={label} onClick={() => setPrivacy(!hidden)}>
      {hidden ? <EyeOff aria-hidden className="size-4.5" /> : <Eye aria-hidden className="size-4.5" />}
    </button>
  );
}
