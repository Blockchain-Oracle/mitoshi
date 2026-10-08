"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/ui/sheets/AccountSheet.tsx — a right-edge drawer
// (D-190) on Mitoshi's money: the wallet's pathUSD and the Trading Balance as two tiles, Add money (the faucet on
// testnet), Withdraw (`SendPanel`), the Trading Balance's own panel (in and out), Activity (trade history), Collect for
// anything settled and still held, the one-tap card, the Trading and App groups, and Sign out behind a centred confirm.
// No demo, no reset (D-191).
import type { Address } from "@cwf/core";
import { useClaimables } from "@cwf/markets/react";
import { ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight, CircleHelp, Download, History, MessageSquare, Settings, SlidersHorizontal, Trophy, Wallet } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { CollectPlate } from "@/features/markets/claims/CollectPlate";
import { collectableRows } from "@/features/markets/claims/useCollect";
import { TapTradingChip, useSessionView } from "@/features/session";
import { addressHue } from "@/lib/address-hue";
import { SHELL } from "@/lib/copy";
import { tapFeedback } from "@/lib/feedback";
import { openFunds } from "@/lib/funds-event";
import { usePrivacy } from "@/lib/privacy";
import { useWalletSession } from "@/lib/wallet-session";
import { useTapArmed } from "@/providers/wallet/tap-session";
import { TERMINAL } from "../copy";
import { money } from "../format";
import { HistoryView } from "./HistoryView";
import { ReplayDrawer } from "./ReplayDrawer";
import type { Episode } from "../replay";
import { SendPanel } from "./SendPanel";

const TradingBalancePanel = dynamic(() => import("@/features/vault/TradingBalancePanel").then((m) => m.TradingBalancePanel), { ssr: false });

export type AccountView = "menu" | "send" | "balance" | "history";

function Item({ icon: Icon, label, detail, onClick, href }: { icon: typeof History; label: string; detail?: string; onClick?: () => void; href?: string }) {
  const body = (
    <>
      <Icon aria-hidden className="tm-item-icon" />
      <span className="tm-item-label">{label}</span>
      {detail ? <span className="tm-item-detail">{detail}</span> : null}
      <ChevronRight aria-hidden className="tm-item-chevron" />
    </>
  );
  return href ? (
    <Link href={href} className="tm-item" onClick={tapFeedback}>{body}</Link>
  ) : (
    <button type="button" className="tm-item" onClick={() => (tapFeedback(), onClick?.())}>{body}</button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="tm-group">
      <span className="tm-group-title">{title}</span>
      <div className="tm-group-body">{children}</div>
    </div>
  );
}

export function AccountDrawer({ open, onOpenChange, wallet, equityBase, walletBase, onSettings, initialView = "menu" }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: Address;
  equityBase: bigint | null;
  walletBase: bigint | null;
  onSettings: () => void;
  initialView?: AccountView;
}) {
  const [view, setView] = useState<AccountView>(initialView);
  const [confirmOut, setConfirmOut] = useState(false);
  const [replay, setReplay] = useState<{ episode: Episode; finalPnl: number } | null>(null);
  const masked = usePrivacy();
  const session = useWalletSession();
  const sessionView = useSessionView();
  const tapArmed = useTapArmed();
  const claims = useClaimables(open ? wallet : null);
  const collectable = claims?.ok ? collectableRows(claims.value) : [];
  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);
  const hide = (base: bigint | null) => (base === null ? "—" : masked ? SHELL.masked : money(base));
  const balance = sessionView.deployed ? hide(sessionView.availableBase) : TERMINAL.account.off;
  const titles: Record<AccountView, string> = { menu: TERMINAL.account.title, send: TERMINAL.send.title, balance: TERMINAL.account.balance, history: TERMINAL.history.title };

  return (
    <>
      <SlideOver open={open} onOpenChange={onOpenChange}>
        <SlideOverContent title={titles[view]}>
          {view !== "menu" ? (
            <button type="button" className="tm-back" onClick={() => (tapFeedback(), setView("menu"))}>
              <ChevronLeft aria-hidden className="size-4" /> {TERMINAL.account.back}
            </button>
          ) : null}
          {view === "send" ? <SendPanel wallet={wallet} balanceBase={walletBase} onDone={() => setView("menu")} /> : null}
          {view === "balance" ? <TradingBalancePanel /> : null}
          {view === "history" ? <HistoryView wallet={wallet} onReplay={(episode, finalPnl) => setReplay({ episode, finalPnl })} /> : null}
          {view === "menu" ? (
            <div className="tm-account">
              <div className="tm-profile">
                <span aria-hidden className="tm-avatar tm-avatar-lg" style={{ "--tm-hue": addressHue(wallet) } as CSSProperties}>{wallet.slice(2, 4).toUpperCase()}</span>
                <span className="tm-pos-main">
                  <span className="tm-pos-title tm-mono">{`${wallet.slice(0, 6)}…${wallet.slice(-4)}`}</span>
                  <span className="tm-pos-meta">{TERMINAL.account.testnet}</span>
                </span>
              </div>
              <div className="tm-card tm-balance">
                <span className="tm-card-title">{TERMINAL.account.equity}</span>
                <span className="tm-balance-figure">{hide(equityBase)}</span>
                <div className="tm-tiles">
                  <span><small>{TERMINAL.account.wallet}</small>{hide(walletBase)}</span>
                  <span><small>{TERMINAL.account.balance}</small>{balance}</span>
                </div>
              </div>
              <div className="tm-actions">
                <button type="button" className="tm-action" onClick={() => (tapFeedback(), openFunds())}><ArrowDownToLine aria-hidden />{TERMINAL.account.addMoney}</button>
                <button type="button" className="tm-action" onClick={() => (tapFeedback(), setView("send"))}><ArrowUpFromLine aria-hidden />{TERMINAL.account.withdraw}</button>
                <button type="button" className="tm-action" onClick={() => (tapFeedback(), setView("balance"))}><Wallet aria-hidden />{TERMINAL.account.transfer}</button>
                <button type="button" className="tm-action" onClick={() => (tapFeedback(), setView("history"))}><History aria-hidden />{TERMINAL.account.activity}</button>
              </div>
              {collectable.length ? <CollectPlate wallet={wallet} rows={collectable} /> : null}
              {!tapArmed && sessionView.status !== "armed" ? (
                <div className="tm-arm"><span className="tm-field-hint">{TERMINAL.arm.lead}</span><TapTradingChip /></div>
              ) : null}
              <Group title={TERMINAL.account.trading}>
                <Item icon={History} label={TERMINAL.account.history} onClick={() => setView("history")} />
                <Item icon={Trophy} label={TERMINAL.account.leaderboard} href="/leaderboard" />
                <Item icon={SlidersHorizontal} label={TERMINAL.account.settings} onClick={onSettings} />
              </Group>
              <Group title={TERMINAL.account.app}>
                <Item icon={Settings} label={TERMINAL.account.soundVibration} href="/settings/account" />
                <Item icon={CircleHelp} label={TERMINAL.account.howItWorks} href="/how-it-works" />
                <Item icon={Download} label={TERMINAL.account.install} href="/download" />
                <Item icon={MessageSquare} label={TERMINAL.account.feedback} href="/contact" />
              </Group>
              <button type="button" className="tm-signout" onClick={() => (tapFeedback(), setConfirmOut(true))}>{TERMINAL.account.signOut}</button>
            </div>
          ) : null}
        </SlideOverContent>
      </SlideOver>
      <ReplayDrawer open={replay !== null} onOpenChange={(o) => !o && setReplay(null)} episode={replay?.episode ?? null} finalPnl={replay?.finalPnl ?? null} />
      <Modal
        open={confirmOut}
        onOpenChange={setConfirmOut}
        title={TERMINAL.account.signOutConfirm}
        description={TERMINAL.account.signOutBody}
        footer={
          <div className="tm-buttons">
            <button type="button" className="tm-btn tm-btn-cta is-quiet" onClick={() => setConfirmOut(false)}>{TERMINAL.account.cancel}</button>
            <button type="button" className="tm-btn tm-btn-cta" onClick={() => { setConfirmOut(false); onOpenChange(false); void session.disconnect(); }}>{TERMINAL.account.signOut}</button>
          </div>
        }
      />
    </>
  );
}
