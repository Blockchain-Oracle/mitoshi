"use client";
/**
 * The ticket's tap-trading chip (Masayume 68f7a09:web/src/features/session/SessionChip.tsx grammar, `tk-lev`): on, it
 * says so and what it may still approve; off, one tap opens the arm step in a centred modal (never a sheet). An
 * injected wallet signs each call itself and is told so. D-140.
 */
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { ArmWalletKey, dollars, untilText } from "./ArmWalletKey";
import { TAP } from "./copy";

/** `className` and `offLabel` restyle the trigger for a surface without the ticket's `tk-*` styles (the terminal). */
export function TapChip({ className, offLabel, defaultOpen = false }: { className?: string; offLabel?: string; defaultOpen?: boolean } = {}) {
  const shell = useWalletShell();
  const [open, setOpen] = useState(defaultOpen);
  if (!shell.tempo) return null;
  const key = shell.walletKey;
  const title = key ? TAP.chip.titleOn(dollars(key.limitBase), untilText(key.expirySec)) : shell.canArmWalletKey ? TAP.chip.titleOff : TAP.chip.titleUnavailable;
  const label = key ? TAP.chip.on : (offLabel ?? TAP.chip.off);
  return (
    <>
      <button type="button" className={className ?? "tk-lev min-h-touch"} aria-pressed={key !== null} disabled={!key && !shell.canArmWalletKey} title={title} aria-label={`${label} — ${title}`} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? (
        <Modal open={open} onOpenChange={setOpen} eyebrow={TAP.eyebrow} title={TAP.title}>
          <ArmWalletKey onDone={() => setOpen(false)} />
        </Modal>
      ) : null}
    </>
  );
}
