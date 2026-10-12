"use client";
// Ported from Masayume 68f7a09:web/src/features/funding/CreditWelcome.tsx — the one-time celebration for an address's
// first credit, auto-dismissed after eight seconds (a moment, not a wall). Now on the shared centred `Modal` with the
// badge's spring under `m.*` (LazyMotion) and reduced motion honoured by `MotionConfig`.
import { Sparkles } from "lucide-react";
import { m } from "motion/react";
import { useEffect } from "react";
import { MotionScope } from "@/components/motion-scope";
import { Modal } from "@/components/ui/modal";
import { FUNDING } from "./copy";

export default function CreditWelcome({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => onOpenChange(false), 8_000);
    return () => clearTimeout(timer);
  }, [open, onOpenChange]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={FUNDING.welcome.eyebrow}
      title={FUNDING.welcome.title}
      footer={
        <button type="button" onClick={() => onOpenChange(false)} className="inline-flex h-(--ticket-cta-height) w-full items-center justify-center rounded-md bg-accent-fill px-5 type-body-strong text-on-accent">
          {FUNDING.welcome.cta}
        </button>
      }
    >
      <MotionScope>
        <m.span
          aria-hidden
          className="mx-auto grid size-14 place-items-center rounded-full border border-hairline bg-surface-2 text-accent"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", damping: 12, stiffness: 240, delay: 0.05 }}
        >
          <Sparkles className="size-6" />
        </m.span>
      </MotionScope>
    </Modal>
  );
}
