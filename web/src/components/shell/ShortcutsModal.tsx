"use client";
// The keyboard map (S22; Baku/roy-chain ede3ed38 help-menu.client.tsx's "Keyboard shortcuts" sheet, as a centred modal
// — owner rule): every row is a shortcut that exists. A lazy island; `?` opens it from anywhere.
import { Modal } from "@/components/ui/modal";
import { SHELL } from "@/lib/copy";

export function ShortcutsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={SHELL.shortcuts} description={SHELL.shortcutsBody}>
      <dl className="shortcut-list">
        {SHELL.shortcutRows.map(([keys, what]) => (
          <div key={keys} className="shortcut-row">
            <dt>{what}</dt>
            <dd><kbd>{keys}</kbd></dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
