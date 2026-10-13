"use client";
// Ported from Masayume 68f7a09:web/src/features/funding/CreditWelcome.tsx — the one-time celebration for an address's
// first credit, auto-dismissed after eight seconds (a moment, not a wall). Now on the shared centred `Modal` with the
// badge's spring under `m.*` (LazyMotion) and reduced motion honoured by `MotionConfig`. R4-4 (D-227; critic gap 10):
// the title names what the account holds now, as the chain reads it (masked in privacy mode), once that read lands.
// R4-13 (critic copy cut 11): no eyebrow — the title says it, the line under it the amount.
import { Sparkles } from "lucide-react";
import { m } from "motion/react";
import { useBalanceSheet } from "@cwf/markets/react";
import { useEffect } from "react";
import { money } from "@/features/terminal/format";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { useWalletSession } from "@/lib/wallet-session";
import { MotionScope } from "@/components/motion-scope";
import { Modal } from "@/components/ui/modal";
import { FUNDING } from "./copy";

export default function CreditWelcome({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const sheet = useBalanceSheet(useWalletSession().address);
  const hidden = usePrivacy();
  const held = sheet?.ok && sheet.value.spendableBase > 0n ? (hidden ? SHELL.masked : money(sheet.value.spendableBase)) : null;
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => onOpenChange(false), 8_000);
    return () => clearTimeout(timer);
  }, [open, onOpenChange]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={FUNDING.welcome.title}
      description={held ? FUNDING.welcome.titleWith(held) : undefined}
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
