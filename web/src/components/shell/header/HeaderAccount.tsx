"use client";
// Ported from Masayume 68f7a09:web/src/components/shell/header/{HeaderAccount,HeaderMoneyPill}.tsx — the money pill
// (pathUSD, a `+` that opens Add money; "never show a half-loaded sum") and the address pill with its menu. The pill is
// laid out from 21st.dev 1600 haydenbleasel/pill (avatar · label · chevron) and the menu (`AccountMenu`, a lazy
// island) from 21st.dev 24857 shadcnspace/dropdown-menu-01.
// S22 (D-189): two placements in the roy-chain/Slush shell — the rail's foot (Slush: the account and the balance pill
// with its eye; full at ≥ 1280 px, the account alone on the 88 px rail) and the top line (the money pill wherever the
// rail is compact or hidden, the account on phones). Which copy shows at which width is CSS (`app-shell.css`), so
// both render the same session and one balance query.
import { ChevronDown, LogIn } from "lucide-react";
import { AccountAvatar } from "./AccountAvatar";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { ACCOUNT_MENU, BANNER, CONNECT } from "@/lib/copy";
import { onIdle } from "@/lib/idle";
import { useWalletSession } from "@/lib/wallet-session";
import { cn } from "@/lib/utils";
import { ACCOUNT } from "@/providers/wallet/copy";
import { dollars, shortAddress } from "@/providers/wallet/format";
import { openFunds } from "@/lib/funds-event";
import type { AccountMenuProps } from "./AccountMenu";
import { useSessionView } from "@/features/session/context";

// The persistent tap-trading allowance pill (S7, UX-06): a lazy island that loads only once a Trading Balance grant
// exists, compact in the top line (the full pill with its one-tap fix lives on the ticket and Portfolio).
const AllowancePill = dynamic(() => import("@/features/session/AllowancePill").then((m) => m.AllowancePill), { ssr: false });

const DemoMoneyTile = dynamic(() => import("./MoneyPill").then((m) => m.DemoMoneyTile), { ssr: false });
const DemoMoneyPill = dynamic(() => import("./MoneyPill").then((m) => m.DemoMoneyPill), { ssr: false });

// The money pill's balance read loads with the session (the same pill, "—", shows until it does).
const MoneyPill = dynamic(() => import("./MoneyPill").then((m) => m.MoneyPill), {
  ssr: false,
  loading: () => (
    <span className="money-pill">
      <button type="button" onClick={openFunds} aria-label={`Balance ${dollars(null)}. Add money`} className="dusdc-pill min-h-touch">
        <span className="dusdc-total numbers dusdc-total--dim">{dollars(null)}</span>
        <span className="dusdc-plus" aria-hidden>+</span>
      </button>
    </span>
  ),
});

// The account menu (Base UI Menu + floating-ui) is a lazy island preloaded on idle (§3.1); until it arrives the pill
// renders the same trigger; a press (pointerdown, or click for keyboards) loads it and opens it, even mid-swap.
let menuModule: Promise<ComponentType<AccountMenuProps>> | null = null;
const loadMenu = () => (menuModule ??= import("./AccountMenu").then((m) => m.AccountMenu));

export type AccountPlacement = "rail" | "top";

export function HeaderAccount({ placement = "top" }: { placement?: AccountPlacement }) {
  const session = useWalletSession();
  const tapTrading = useSessionView();
  const [Menu, setMenu] = useState<ComponentType<AccountMenuProps> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const load = useCallback(() => void loadMenu().then((C) => setMenu(() => C)), []);
  useEffect(() => (session.address ? onIdle(load) : undefined), [session.address, load]);
  const rail = placement === "rail";

  if (session.isConnecting) {
    return <span className={cn("btn btn-primary invisible", rail ? "rail-account" : "top-account")} aria-hidden="true">{CONNECT.connect}</span>;
  }
  if (!session.isConnected || !session.address) {
    const signIn = (
      <button type="button" className={cn("btn btn-primary sign-in-button", rail ? "rail-account" : "top-account")} onClick={session.connect} aria-label={CONNECT.connect}>
        <LogIn aria-hidden className="sign-in-icon size-4" />
        <span className="sign-in-label">{CONNECT.connect}</span>
      </button>
    );
    // DEMO (D-223): the rail shows the paper balance over the way in, as Owarine's demo rail does.
    return rail ? (
      <>
        <span className="rail-money"><DemoMoneyTile /></span>
        {signIn}
      </>
    ) : (
      <>
        <span className="top-money"><DemoMoneyPill /></span>
        {signIn}
      </>
    );
  }
  if (!session.isRightChain) {
    return <button type="button" className={cn("btn btn-outline", rail ? "rail-account" : "top-account")} onClick={() => void session.switchToTempo()}>{BANNER.switchTo("Tempo")}</button>;
  }
  const account = Menu ? (
    <Menu open={menuOpen} onOpenChange={setMenuOpen} side={rail ? "top" : "bottom"} />
  ) : (
    <button type="button" className="wallet-pill min-h-touch" aria-label={ACCOUNT_MENU.open} aria-haspopup="menu" aria-expanded={false} onPointerDown={() => { load(); setMenuOpen(true); }} onClick={() => { load(); setMenuOpen(true); }}>
      <AccountAvatar seed={session.address} className="wallet-pill-avatar" />
      <span className="wallet-pill-id">
        <span className="wallet-pill-kind">{session.kind ? ACCOUNT.kinds[session.kind] : ACCOUNT_MENU.open}</span>
        <span className="numbers wallet-pill-addr">{shortAddress(session.address)}</span>
      </span>
      <ChevronDown aria-hidden className="size-3.5" />
    </button>
  );
  if (rail) {
    return (
      <>
        <span className="rail-money"><MoneyPill address={session.address} variant="rail" /></span>
        <span className="rail-account">{account}</span>
      </>
    );
  }
  return (
    <>
      {tapTrading.grant && tapTrading.status !== "disarmed" ? <AllowancePill compact className="max-sm:hidden" /> : null}
      <span className="top-money"><MoneyPill address={session.address} /></span>
      <span className="top-account">{account}</span>
    </>
  );
}
