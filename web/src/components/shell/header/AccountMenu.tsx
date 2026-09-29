"use client";
// The header account menu, split out of HeaderAccount as a lazy island (§3.1). Laid out from 21st.dev 24857
// shadcnspace/dropdown-menu-01 (identity header, rows, separator, sign out) on Base UI Menu, in Masayume's classes.
import { Menu } from "@base-ui/react/menu";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useBalanceSheet } from "@cwf/markets/react";
import { ACCOUNT_MENU, CONNECT } from "@/lib/copy";
import { useWalletSession } from "@/lib/wallet-session";
import { ACCOUNT } from "@/providers/wallet/copy";
import { dollars, shortAddress } from "@/providers/wallet/format";

export interface AccountMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountMenu({ open, onOpenChange }: AccountMenuProps) {
  const session = useWalletSession();
  const sheet = useBalanceSheet(session.address);
  const value = sheet?.ok ? sheet.value : null;
  if (!session.address) return null;
  return (
    <Menu.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger className="wallet-pill min-h-touch" aria-label={ACCOUNT_MENU.open}>
        <span className="addr-dot" aria-hidden />
        <span className="numbers wallet-pill-addr">{shortAddress(session.address)}</span>
        <ChevronDown aria-hidden className="size-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="nav-menu-positioner">
          <Menu.Popup className="header-account-menu account-menu-popup">
            <div className="header-account-pools">
              <p className="type-caption text-ink-secondary">{session.kind ? ACCOUNT.kinds[session.kind] : ""}</p>
              <div className="header-account-row"><span>{ACCOUNT_MENU.wallet}</span><span className="val numbers">{dollars(value?.spendableBase)}</span></div>
              <div className="header-account-row"><span>{ACCOUNT_MENU.tradingAccount}</span><span className="val val--soft">{value?.vaultBase === null ? ACCOUNT.tradingBalancePending : dollars(value?.vaultBase)}</span></div>
            </div>
            <Menu.LinkItem render={<Link href="/portfolio" />} closeOnClick className="header-account-link">{ACCOUNT_MENU.portfolio}</Menu.LinkItem>
            <Menu.LinkItem render={<Link href="/settings/account" />} closeOnClick className="header-account-link">{ACCOUNT_MENU.settings}</Menu.LinkItem>
            <Menu.Item onClick={session.openAccount} className="header-account-link">{ACCOUNT.title}</Menu.Item>
            <Menu.Separator className="my-1 h-px bg-hairline" />
            <Menu.Item onClick={() => void session.disconnect()} className="header-account-link header-account-link--danger">{CONNECT.disconnect}</Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
