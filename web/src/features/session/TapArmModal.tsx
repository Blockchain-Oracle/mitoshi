"use client";
/**
 * The one-tap arm step on its own (R4-3, D-227): the centred modal TapTradingChip opens — the chooser (wallet key ·
 * Trading Balance) once a grant was revoked, else the passkey wallet key — without a trigger, so a toast or a settings
 * row can open it. Owarine 90a91d71 SessionModal is the same step opened from more than one place. Never a sheet above
 * 768 px; below it the kit Modal is the sheet (R4-2).
 */
import { Modal } from "@/components/ui/modal";
import { ArmWalletKey } from "@/features/tap-trading/ArmWalletKey";
import { TAP } from "@/features/tap-trading/copy";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { ArmSlot } from "./ArmSlot";
import { ArmTradingBalance } from "./ArmTradingBalance";
import { SESSION } from "./copy";
import { useSessionView } from "./context";

export function TapArmModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const view = useSessionView();
  const shell = useWalletShell();
  // The chooser follows a revoked grant; the wallet key alone needs Tempo's passkey account (TapChip's own guard).
  if (!open || (view.status !== "disarmed" && !shell.tempo)) return null;
  const done = () => onOpenChange(false);
  const walletKeyOn = shell.walletKey !== null;
  const body =
    view.status === "disarmed" ? (
      <ArmSlot
        initial={shell.canArmWalletKey && !walletKeyOn ? "wallet" : "balance"}
        choices={[
          ...(shell.canArmWalletKey ? [{ id: "wallet", label: SESSION.chooser.wallet, node: <ArmWalletKey onDone={done} /> }] : []),
          { id: "balance", label: SESSION.chooser.balance, node: <ArmTradingBalance onDone={done} /> },
        ]}
      />
    ) : (
      <ArmWalletKey onDone={done} />
    );
  return (
    <Modal open={open} onOpenChange={onOpenChange} eyebrow={TAP.eyebrow} title={TAP.title}>
      {body}
    </Modal>
  );
}
