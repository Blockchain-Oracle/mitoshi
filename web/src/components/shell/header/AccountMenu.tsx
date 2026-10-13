"use client";
// The account popover (Owarine 90a91d71 `features/canton-ux/seat/SeatAccountMenu.tsx`; O-10, D-224), a lazy island: the
// marble avatar, what the account is and its network chip, then one recessed panel — Address (copy), Wallet, Trading
// Balance — and the items: Portfolio, Account & keys, the balance eye, Sign out.
// On Base UI Menu (keyboard, typeahead, focus return); the rail's foot opens it upward, the top line below. Its own
// positioner class (R4-0, D-227): the old header's one was hidden on phones, so the phone avatar opened nothing.
// R4-8 (D-227): from the rail it opens to the right, beside the rail and never over it (Owarine: side right, offset 28,
// align end); the items carry Owarine's 18 px muted icons, the danger item last.
import { Menu } from "@base-ui/react/menu";
import { useBalanceSheet } from "@cwf/markets/react";
import { Check, ChevronDown, Copy, Eye, EyeOff, KeyRound, LogOut, WalletCards } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ACCOUNT_MENU, CONNECT, SHELL } from "@/lib/copy";
import { setPrivacy, usePrivacy } from "@/lib/privacy";
import { useWalletSession } from "@/lib/wallet-session";
import { ACCOUNT } from "@/providers/wallet/copy";
import { dollars, shortAddress } from "@/providers/wallet/format";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { AccountAvatar } from "./AccountAvatar";

const COPIED_MS = 1_500;

export interface AccountMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The rail's foot opens it beside the rail (R4-8); the top line opens it below. */
  side?: "right" | "bottom";
}

export function AccountMenu({ open, onOpenChange, side = "bottom" }: AccountMenuProps) {
  const session = useWalletSession();
  const shell = useWalletShell();
  const sheet = useBalanceSheet(session.address);
  const value = sheet?.ok ? sheet.value : null;
  const hidden = usePrivacy();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  if (!session.address) return null;
  const address = session.address;
  const kind = session.kind ? ACCOUNT.kinds[session.kind] : ACCOUNT_MENU.open;
  return (
    <Menu.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger className="wallet-pill min-h-touch" aria-label={ACCOUNT_MENU.open} data-flood-origin="">
        <AccountAvatar seed={address} className="wallet-pill-avatar" />
        <span className="wallet-pill-id">
          <span className="wallet-pill-kind">{kind}</span>
          <span className="numbers wallet-pill-addr">{shortAddress(address)}</span>
        </span>
        <ChevronDown aria-hidden className="wallet-pill-chevron size-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side={side} sideOffset={side === "right" ? 28 : 10} align="end" collisionPadding={12} className="am-positioner">
          <Menu.Popup className="am-popup">
            <div className="am-head">
              <AccountAvatar seed={address} size={36} />
              <span className="am-name">{kind}</span>
              <span className="am-chip">
                <span aria-hidden className="am-chip-dot" />
                {ACCOUNT.network[shell.network]}
              </span>
            </div>
            <dl className="am-rows">
              <Row label={ACCOUNT.address}>
                <span className="flex min-w-0 items-center gap-1">
                  <span className="numbers truncate">{shortAddress(address)}</span>
                  <button type="button" className="am-copy" aria-label={copied ? ACCOUNT.copied : ACCOUNT.copy} title={copied ? ACCOUNT.copied : ACCOUNT.copy} onClick={() => void navigator.clipboard?.writeText(address).then(() => setCopied(true), () => undefined)}>
                    {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
                  </button>
                </span>
              </Row>
              <Row label={ACCOUNT_MENU.wallet}>
                <span className="numbers">{hidden ? SHELL.masked : dollars(value?.spendableBase)}</span>
              </Row>
              <Row label={ACCOUNT_MENU.tradingAccount}>
                <span className="numbers">{hidden ? SHELL.masked : value?.vaultBase === null ? ACCOUNT.tradingBalancePending : dollars(value?.vaultBase)}</span>
              </Row>
            </dl>
            <div className="am-items">
              <Menu.LinkItem render={<Link href="/portfolio" />} closeOnClick className="am-item"><WalletCards aria-hidden />{ACCOUNT_MENU.portfolio}</Menu.LinkItem>
              <Menu.LinkItem render={<Link href="/settings/account" />} closeOnClick className="am-item"><KeyRound aria-hidden />{ACCOUNT_MENU.settings}</Menu.LinkItem>
              {/* The balance eye for every width (phones have no room for it in the top line; Slush's privacy, RV-10). */}
              <Menu.Item onClick={() => setPrivacy(!hidden)} className="am-item">{hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}{hidden ? SHELL.privacyShow : SHELL.privacyHide}</Menu.Item>
              <Menu.Item onClick={() => void session.disconnect()} className="am-item am-item--danger"><LogOut aria-hidden />{CONNECT.disconnect}</Menu.Item>
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="am-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
