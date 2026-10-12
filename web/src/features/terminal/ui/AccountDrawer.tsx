"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/ui/sheets/AccountSheet.tsx — a right-edge drawer
// (D-190) on Mitoshi's money: the wallet's pathUSD and the Trading Balance as two tiles with the range P&L line and
// curve (`PnlCard`), Add money (the faucet on testnet), Withdraw (`SendPanel`), the Trading Balance's own panel (in and
// out), Activity (the money moves, `ActivityView`; trades are Trade history's), Collect for
// anything settled and still held, the one-tap card, the Trading and App groups, and Sign out behind a centred confirm.
// No demo, no reset (D-191).
import type { Address } from "@cwf/core";
import { useClaimables } from "@cwf/markets/react";
import { ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight, CircleHelp, Download, History, Medal, MessageSquare, Settings, ShieldAlert, SlidersHorizontal, Trophy, Wallet } from "lucide-react";
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
import { useBackupNeeded } from "@/features/account/useBackupNeeded";
import { useTapArmed } from "@/providers/wallet/tap-session";
import { TERMINAL } from "../copy";
import { money } from "../format";
import type { PositionsTotals } from "../positions-totals";
import { ActivityView } from "./ActivityView";
import { AccountProfile } from "./AccountProfile";
import { HistoryView } from "./HistoryView";
import { PnlCard } from "./PnlCard";
import { InstallDrawer } from "./InstallDrawer";
import { ReplayDrawer } from "./ReplayDrawer";
import type { Episode } from "../replay";
import { SendPanel } from "./SendPanel";

const TradingBalancePanel = dynamic(() => import("@/features/vault/TradingBalancePanel").then((m) => m.TradingBalancePanel), { ssr: false });
// What a previous Trading Balance still holds (S24.2), self-hiding when it holds nothing.
const LegacyBalance = dynamic(() => import("@/features/vault/LegacyBalance").then((m) => m.LegacyBalance), { ssr: false });
// The leaderboard view (RV-86, S5's data) loads when it is opened.
const LeaderboardView = dynamic(() => import("./LeaderboardView").then((m) => m.LeaderboardView), { ssr: false });
// The season league (D-195, S13 step 11) loads when it is opened.
const LeagueView = dynamic(() => import("./LeagueView").then((m) => m.LeagueView), { ssr: false });

export type AccountView = "menu" | "send" | "balance" | "history" | "activity" | "leaderboard" | "league";

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

export function AccountDrawer({ open, onOpenChange, wallet, equityBase, walletBase, totals, onSettings, initialView = "menu" }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: Address;
  equityBase: bigint | null;
  walletBase: bigint | null;
  /** The open positions: P&L and cost of the priced ones, and what their sales already realised (D-227). */
  totals: PositionsTotals;
  onSettings: () => void;
  initialView?: AccountView;
}) {
  const [view, setView] = useState<AccountView>(initialView);
  const [confirmOut, setConfirmOut] = useState(false);
  const [install, setInstall] = useState(false);
  const [replay, setReplay] = useState<{ episode: Episode; finalPnl: number } | null>(null);
  const masked = usePrivacy();
  const session = useWalletSession();
  const sessionView = useSessionView();
  // The backup-passkey prompt after the first deposit (D-053).
  const backupNeeded = useBackupNeeded(session.kind === "passkey", walletBase !== null && walletBase > 0n);
  const tapArmed = useTapArmed();
  const claims = useClaimables(open ? wallet : null);
  const collectable = claims?.ok ? collectableRows(claims.value) : [];
  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);
  const hide = (base: bigint | null) => (base === null ? "—" : masked ? SHELL.masked : money(base));
  const balance = sessionView.deployed ? hide(sessionView.availableBase) : TERMINAL.account.off;
  const titles: Record<AccountView, string> = { menu: TERMINAL.account.title, send: TERMINAL.send.title, balance: TERMINAL.account.balance, history: TERMINAL.history.title, activity: TERMINAL.activity.title, leaderboard: TERMINAL.account.leaderboard, league: TERMINAL.account.league };

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
          {view === "activity" ? <ActivityView wallet={wallet} open={open} /> : null}
          {view === "leaderboard" ? <LeaderboardView wallet={wallet} /> : null}
          {view === "league" ? <LeagueView wallet={wallet} /> : null}
          {view === "menu" ? (
            <div className="tm-account">
              <AccountProfile wallet={wallet} />
              <LegacyBalance owner={wallet} />
              <div className="tm-card tm-balance">
                <span className="tm-card-title">{TERMINAL.account.equity}</span>
                <span className="tm-balance-figure">{hide(equityBase)}</span>
                <PnlCard wallet={wallet} totals={totals} />
                <div className="tm-tiles">
                  <span><small>{TERMINAL.account.wallet}</small>{hide(walletBase)}</span>
                  <span><small>{TERMINAL.account.balance}</small>{balance}</span>
                </div>
              </div>
              <div className="tm-actions">
                <button type="button" className="tm-action" onClick={() => (tapFeedback(), openFunds())}><ArrowDownToLine aria-hidden />{TERMINAL.account.addMoney}</button>
                <button type="button" className="tm-action" onClick={() => (tapFeedback(), setView("send"))}><ArrowUpFromLine aria-hidden />{TERMINAL.account.withdraw}</button>
                <button type="button" className="tm-action" onClick={() => (tapFeedback(), setView("balance"))}><Wallet aria-hidden />{TERMINAL.account.transfer}</button>
                <button type="button" className="tm-action" onClick={() => (tapFeedback(), setView("activity"))}><History aria-hidden />{TERMINAL.account.activity}</button>
              </div>
              {collectable.length ? <CollectPlate wallet={wallet} rows={collectable} /> : null}
              {!tapArmed && sessionView.status !== "armed" ? (
                <div className="tm-arm"><span className="tm-field-hint">{TERMINAL.arm.lead}</span><TapTradingChip className="tm-choice tm-arm-cta" offLabel={TERMINAL.arm.cta} /></div>
              ) : null}
              {backupNeeded ? (
                <Group title={TERMINAL.account.security}>
                  <Item icon={ShieldAlert} label={TERMINAL.account.backup} detail={TERMINAL.account.backupWhy} href="/settings/account#backup" />
                </Group>
              ) : null}
              <Group title={TERMINAL.account.trading}>
                <Item icon={History} label={TERMINAL.account.history} onClick={() => setView("history")} />
                <Item icon={Trophy} label={TERMINAL.account.leaderboard} onClick={() => setView("leaderboard")} />
                <Item icon={Medal} label={TERMINAL.account.league} onClick={() => setView("league")} />
                <Item icon={SlidersHorizontal} label={TERMINAL.account.settings} onClick={onSettings} />
              </Group>
              <Group title={TERMINAL.account.app}>
                <Item icon={Settings} label={TERMINAL.account.soundVibration} href="/settings/account" />
                <Item icon={CircleHelp} label={TERMINAL.account.howItWorks} href="/how-it-works" />
                <Item icon={Download} label={TERMINAL.account.install} onClick={() => setInstall(true)} />
                <Item icon={MessageSquare} label={TERMINAL.account.feedback} href="/contact" />
              </Group>
              <button type="button" className="tm-signout" onClick={() => (tapFeedback(), setConfirmOut(true))}>{TERMINAL.account.signOut}</button>
            </div>
          ) : null}
        </SlideOverContent>
      </SlideOver>
      <InstallDrawer open={install} onOpenChange={setInstall} />
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
