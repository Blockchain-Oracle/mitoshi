"use client";
/**
 * The ticket's tap-trading slot (Masayume 68f7a09:web/src/features/session/SessionChip.tsx grammar, `tk-lev`): with a
 * Trading Balance grant it is the persistent allowance pill (UX-06); otherwise S4's wallet-key chip, whose centred modal
 * now offers both paths (the arm slot's chooser, `TapArmModal`). Never a sheet.
 */
import { useState } from "react";
import { TAP } from "@/features/tap-trading/copy";
import { TapChip } from "@/features/tap-trading/TapChip";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { AllowancePill } from "./AllowancePill";
import { SESSION } from "./copy";
import { useSessionView } from "./context";
import { TapArmModal } from "./TapArmModal";

/** `className` and `offLabel` restyle the off trigger where the ticket's `tk-*` styles aren't loaded (the terminal). */
export function TapTradingChip({ className, offLabel }: { className?: string; offLabel?: string } = {}) {
  const view = useSessionView();
  const shell = useWalletShell();
  const [open, setOpen] = useState(false);
  if (view.grant && view.status !== "disarmed") return <AllowancePill />;
  if (view.status !== "disarmed") return <TapChip className={className} offLabel={offLabel} />;
  const walletKeyOn = shell.walletKey !== null;
  return (
    <>
      <button type="button" className={className ?? "tk-lev min-h-touch"} aria-pressed={walletKeyOn} title={walletKeyOn ? SESSION.chooser.titleOn : SESSION.chooser.titleOff} onClick={() => setOpen(true)}>
        {walletKeyOn ? TAP.chip.on : (offLabel ?? TAP.chip.off)}
      </button>
      <TapArmModal open={open} onOpenChange={setOpen} />
    </>
  );
}
