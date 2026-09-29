"use client";
// Ported from Agari 03b30ab:web/src/providers/wallet/AccountModal.tsx (RainbowKit's account modal) with C.3.1's
// additions: the account kind badge, the network, the Wallet and Trading Balance lines, the linked Robinhood Chain
// wallet (and linking one), and the way to the trust surface (Account & keys). A centred modal (owner rule).
import { useBalanceSheet } from "@cwf/markets/react";
import { Check, Copy, KeyRound, Link2, LogOut } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ACCOUNT } from "./copy";
import { dollars, shortAddress } from "./format";
import { useWalletShell } from "./wallet-shell-context";

export default function AccountModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const shell = useWalletShell();
  const tempo = shell.tempo;
  const sheet = useBalanceSheet(tempo?.address ?? null);
  const value = sheet?.ok ? sheet.value : null;
  const [copied, setCopied] = useState(false);
  if (!tempo) return null;
  const row = "flex min-h-touch items-center justify-between gap-3 border-b border-hairline type-body";
  return (
    <Modal open={open} onOpenChange={onOpenChange} eyebrow={ACCOUNT.kinds[tempo.kind]} title={<span className="numbers">{shortAddress(tempo.address)}</span>} description={ACCOUNT.network[shell.network]}>
      <dl className="flex flex-col">
        <div className={row}><dt className="text-ink-secondary">{ACCOUNT.wallet}</dt><dd className="numbers text-ink">{dollars(value?.spendableBase)}</dd></div>
        <div className={row}><dt className="text-ink-secondary">{ACCOUNT.tradingBalance}</dt><dd className="text-ink-secondary">{value?.vaultBase === null ? ACCOUNT.tradingBalancePending : dollars(value?.vaultBase)}</dd></div>
        <div className={row}>
          <dt className="text-ink-secondary">{ACCOUNT.robinhood}</dt>
          <dd>
            {shell.robinhood ? (
              <span className="numbers text-ink">{shortAddress(shell.robinhood.address)}</span>
            ) : (
              <button type="button" onClick={() => shell.openPicker("robinhood")} className="inline-flex min-h-touch items-center gap-1.5 type-body-strong text-ink underline underline-offset-4"><Link2 aria-hidden className="size-4" />{ACCOUNT.linkRobinhood}</button>
            )}
          </dd>
        </div>
      </dl>
      {!tempo.caps.batch ? <p className="type-caption text-ink-secondary">{ACCOUNT.injectedCaps}</p> : null}
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => void navigator.clipboard?.writeText(tempo.address).then(() => setCopied(true))} className="flex min-h-touch flex-col items-center justify-center gap-1 rounded-md border border-hairline py-2 type-caption text-ink">
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied ? ACCOUNT.copied : ACCOUNT.copy}
        </button>
        <Link href="/settings/account" onClick={() => onOpenChange(false)} className="flex min-h-touch flex-col items-center justify-center gap-1 rounded-md border border-hairline py-2 type-caption text-ink!">
          <KeyRound aria-hidden className="size-4" />
          {ACCOUNT.keys}
        </Link>
        <button type="button" onClick={() => { onOpenChange(false); void shell.disconnect(); }} className="flex min-h-touch flex-col items-center justify-center gap-1 rounded-md border border-hairline py-2 type-caption text-ink">
          <LogOut aria-hidden className="size-4" />
          {ACCOUNT.signOut}
        </button>
      </div>
    </Modal>
  );
}
