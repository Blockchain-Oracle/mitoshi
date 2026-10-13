"use client";
// `/settings/account`, the trust surface (D-053), on Owarine's settings grammar (R4-11, D-227) — ported from Owarine
// 90a91d71:web/src/features/terminal/ui/sheets/AccountSheet.tsx (avatar and name, one facts block, then grouped 48 px
// rows whose drill-ins open a sheet) and features/canton-ux/seat/SeatAccountMenu.tsx (the facts as one recessed `dl`).
// The head reuses the account menu's `am-head` / `am-rows`; a summary strip holds "Stop all" in the first fold; each
// SECURITY or DATA row opens a SlideOver (a bottom sheet on phones) whose body is the section it used to be inline.
// R6 money (S21 + T10, D-230): the settings shell owns the title and the tabs; Device and Region moved to their own tab
// (`DeviceSettings`). Signed out there is no wall: the Security group is drawn as it will be — its rows, each "—", not
// tappable — with one inline "Sign in to see yours" as its header row.
import { useState, type ComponentType } from "react";
import { Download, KeyRound, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { useBalanceSheet } from "@cwf/markets/react";
import type { Address } from "@cwf/core";
import { GroupedItem, GroupedList } from "@/components/kit/GroupedList";
import { Pill } from "@/components/kit/Pill";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import type { TempoAccountKind } from "@/providers/wallet/wallet-shell-context";
import { useDataReady } from "@/providers/data/context";
import { AccountHero, AccountSummary } from "./AccountSummary";
import { BackupPasskeySection } from "./BackupPasskeySection";
import { BACKUP } from "./backup-copy";
import { ACCOUNT_PAGE } from "./copy";
import { DATA } from "./data-copy";
import { AiSharingRow, DeleteSheetBody, useDataExport } from "./DataSection";
import { GrantsSection, useGrantCounts } from "./GrantsSection";
import { KeysSection } from "./KeysSection";
import { useKeyCounts } from "./useKeys";
import { useBackupCount, useBackupNeeded } from "./useBackupNeeded";
import { XAccountSheet, xRowDetail } from "@/features/x/XAccountSheet";
import { useXLink } from "@/features/x/useXLink";
import { XGlyph } from "@/features/x/parts";
import "@/styles/account.css";
import "@/components/kit/kit.css";

const P = ACCOUNT_PAGE;
type Drill = "backup" | "keys" | "grants" | "x" | "delete";

export function AccountSettings() {
  const session = useWalletSession();
  return (
    <section className="acct-page">
      {!session.address ? <SignedOutSecurity onSignIn={() => session.connectFor(P.signInIntent)} /> : <SignedIn address={session.address} kind={session.kind} />}
    </section>
  );
}

/** The Security group as it will read once signed in: the same rows, "—" for each figure, the sign-in on top. */
function SignedOutSecurity({ onSignIn }: { onSignIn: () => void }) {
  const rows: { icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; label: string }[] = [
    { icon: ShieldCheck, label: BACKUP.title },
    { icon: KeyRound, label: P.keys.title },
    { icon: Wallet, label: P.grants.title },
    { icon: XGlyph as never, label: P.x },
  ];
  return (
    <GroupedList title={P.groups.security}>
      <div className="kit-item acct-signin-row">
        <Pill tone="accent" size="sm" data-primary-action="" onClick={onSignIn}>{P.signIn}</Pill>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="kit-item acct-row-preview" aria-disabled="true">
          <r.icon aria-hidden className="kit-item-icon" />
          <span className="kit-item-label">{r.label}</span>
          <span className="kit-item-detail">—</span>
        </div>
      ))}
    </GroupedList>
  );
}

function SignedIn({ address, kind }: { address: Address; kind: TempoAccountKind | null }) {
  const network = webEnv.markets.network;
  const ready = useDataReady();
  const [drill, setDrill] = useState<Drill | null>(null);
  const keys = useKeyCounts(address);
  const grants = useGrantCounts(address);
  const sheet = useBalanceSheet(address);
  const hasMoney = sheet?.ok === true && sheet.value.spendableBase > 0n;
  const exportData = useDataExport();
  const backups = useBackupCount(kind === "passkey");
  const nudge = useBackupNeeded(kind === "passkey", hasMoney);
  const x = useXLink();
  const close = (open: boolean) => (open ? undefined : setDrill(null));
  const titles: Record<Drill, string> = { backup: BACKUP.title, keys: P.keys.title, grants: P.grants.title, x: P.x, delete: DATA.delete.title };

  return (
    <>
      <AccountHero address={address} kind={kind} />
      {ready ? <AccountSummary account={address} /> : null}
      <GroupedList title={P.groups.security}>
        <GroupedItem icon={ShieldCheck} label={BACKUP.title} detail={kind !== "passkey" ? "—" : backups === null ? "…" : backups === 0 ? BACKUP.noneShort : String(backups)} dot={nudge} onClick={() => setDrill("backup")} />
        <GroupedItem icon={KeyRound} label={P.keys.title} detail={keys === null ? "…" : String(keys)} onClick={() => setDrill("keys")} />
        <GroupedItem icon={Wallet} label={P.grants.title} detail={grants === null ? "…" : String(grants)} onClick={() => setDrill("grants")} />
        <GroupedItem icon={XGlyph as never} label={P.x} detail={x.loading ? "…" : xRowDetail(x)} onClick={() => setDrill("x")} />
      </GroupedList>
      <GroupedList title={P.groups.data}>
        <AiSharingRow />
        <GroupedItem icon={Download} label={DATA.export.title} detail={exportData.working ? DATA.export.working : DATA.export.body} onClick={() => void exportData.run()} />
        <GroupedItem icon={Trash2} label={DATA.delete.title} tone="danger" onClick={() => setDrill("delete")} />
      </GroupedList>

      <SlideOver open={drill !== null} onOpenChange={close}>
        <SlideOverContent title={drill ? titles[drill] : ""} size={drill === "keys" || drill === "grants" ? "lg" : "md"} fields={drill === "delete"}>
          {drill === "backup" ? <BackupPasskeySection hasMoney={hasMoney} /> : null}
          {drill === "keys" && ready ? <KeysSection account={address} network={network} /> : null}
          {drill === "grants" && ready ? <GrantsSection account={address} network={network} /> : null}
          {drill === "x" ? <XAccountSheet /> : null}
          {drill === "delete" ? <DeleteSheetBody address={address} /> : null}
        </SlideOverContent>
      </SlideOver>
    </>
  );
}
