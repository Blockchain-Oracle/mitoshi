"use client";
// Ported from Masayume 68f7a09:web/src/components/shell/header/{HeaderAccount,HeaderMoneyPill}.tsx — the money pill
// (pathUSD, a `+` that opens Add money; "never show a half-loaded sum") and the address pill with its menu. The pill is
// laid out from 21st.dev 1600 haydenbleasel/pill (avatar · label · chevron) and the menu (`AccountMenu`, a lazy
// island) from 21st.dev 24857 shadcnspace/dropdown-menu-01.
import { ChevronDown } from "lucide-react";
import { useBalanceSheet } from "@cwf/markets/react";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { ACCOUNT_MENU, BANNER, CONNECT } from "@/lib/copy";
import { openFunds } from "@/lib/funds-event";
import { onIdle } from "@/lib/idle";
import { useWalletSession } from "@/lib/wallet-session";
import { dollars, shortAddress } from "@/providers/wallet/format";
import type { AccountMenuProps } from "./AccountMenu";

// The account menu (Base UI Menu + floating-ui) is a lazy island preloaded on idle (§3.1); until it arrives the pill
// renders the same trigger; a press (pointerdown, or click for keyboards) loads it and opens it, even mid-swap.
let menuModule: Promise<ComponentType<AccountMenuProps>> | null = null;
const loadMenu = () => (menuModule ??= import("./AccountMenu").then((m) => m.AccountMenu));

export function HeaderAccount() {
  const session = useWalletSession();
  const [Menu, setMenu] = useState<ComponentType<AccountMenuProps> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const load = useCallback(() => void loadMenu().then((C) => setMenu(() => C)), []);
  useEffect(() => (session.address ? onIdle(load) : undefined), [session.address, load]);
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
      {Menu ? (
        <Menu open={menuOpen} onOpenChange={setMenuOpen} />
      ) : (
        <button type="button" className="wallet-pill min-h-touch" aria-label={ACCOUNT_MENU.open} aria-haspopup="menu" aria-expanded={false} onPointerDown={() => { load(); setMenuOpen(true); }} onClick={() => { load(); setMenuOpen(true); }}>
          <span className="addr-dot" aria-hidden />
          <span className="numbers wallet-pill-addr">{shortAddress(session.address)}</span>
          <ChevronDown aria-hidden className="size-3.5" />
        </button>
      )}
    </>
  );
}
