"use client";
// Ported from Masayume 68f7a09:web/src/components/shell/header/{HeaderAccount,HeaderMoneyPill}.tsx — the money pill
// (pathUSD, a `+` that opens Add money; "never show a half-loaded sum") and the address pill with its menu. The pill is
// laid out from 21st.dev 1600 haydenbleasel/pill (avatar · label · chevron) and the menu from 21st.dev 24857
// shadcnspace/dropdown-menu-01 (identity header, rows, separator, sign out) on Base UI Menu, in Masayume's classes.
import { Menu } from "@base-ui/react/menu";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useBalanceSheet } from "@cwf/markets/react";
import { ACCOUNT_MENU, BANNER, CONNECT } from "@/lib/copy";
import { openFunds } from "@/lib/funds-event";
import { useWalletSession } from "@/lib/wallet-session";
import { ACCOUNT } from "@/providers/wallet/copy";
import { dollars, shortAddress } from "@/providers/wallet/format";

export function HeaderAccount() {
  const session = useWalletSession();
  const sheet = useBalanceSheet(session.address);
  const value = sheet?.ok ? sheet.value : null;

  if (session.isConnecting) {
    return <span className="btn btn-primary invisible" aria-hidden="true">{CONNECT.connect}</span>;
  }
  if (!session.isConnected || !session.address) {
    return <button type="button" className="btn btn-primary" onClick={session.connect}>{CONNECT.connect}</button>;
  }
  if (!session.isRightChain) {
    return <button type="button" className="btn btn-outline" onClick={() => void session.switchToTempo()}>{BANNER.switchTo("Tempo")}</button>;
  }
  const total = value ? value.spendableBase + (value.vaultBase ?? 0n) : null;
  return (
    <>
      <button type="button" onClick={openFunds} aria-label={`Balance ${dollars(total)}. Add money`} className="dusdc-pill min-h-touch">
        <span className={`dusdc-total numbers${total === null ? " dusdc-total--dim" : ""}`}>{dollars(total)}</span>
        <span className="dusdc-plus" aria-hidden>+</span>
      </button>
      <Menu.Root modal={false}>
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
    </>
  );
}
