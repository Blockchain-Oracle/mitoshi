"use client";
// `/settings/account`, the trust surface (D-053), on Owarine's settings grammar (R4-11, D-227) — ported from Owarine
// 90a91d71:web/src/features/terminal/ui/sheets/AccountSheet.tsx (avatar and name, one facts block, then grouped 48 px
// rows whose drill-ins open a sheet) and features/canton-ux/seat/SeatAccountMenu.tsx (the facts as one recessed `dl`).
// The head reuses the account menu's `am-head` / `am-rows`; a summary strip holds "Stop all" in the first fold; each
// SECURITY or DATA row opens a SlideOver (a bottom sheet on phones) whose body is the section it used to be inline.
import { useEffect, useState, type ReactNode } from "react";
import { Bell, Download, KeyRound, Link2, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { useBalanceSheet } from "@cwf/markets/react";
import type { Address, RegionPosture } from "@cwf/core";
import { GroupedItem, GroupedList } from "@/components/kit/GroupedList";
import { PillButton } from "@/components/kit/PillButton";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { webEnv } from "@/lib/env";
import { readRegionPosture } from "@/lib/region-mark";
import { useWalletSession } from "@/lib/wallet-session";
import { shortAddress } from "@/providers/wallet/format";
import { useWalletShell, type TempoAccountKind } from "@/providers/wallet/wallet-shell-context";
import { useDataReady } from "@/providers/data/context";
import { AccountHero, AccountSummary } from "./AccountSummary";
import { BackupPasskeySection } from "./BackupPasskeySection";
import { BACKUP } from "./backup-copy";
import { ACCOUNT_PAGE } from "./copy";
import { DATA } from "./data-copy";
import { AiSharingRow, DeleteSheetBody, useDataExport } from "./DataSection";
import { FeedbackRows } from "./FeedbackSection";
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
type Drill = "backup" | "keys" | "grants" | "linked" | "x" | "delete";

export function AccountSettings() {
  const session = useWalletSession();
  const [posture, setPosture] = useState<RegionPosture | null>(null);
  useEffect(() => setPosture(readRegionPosture()), []);
  const held = posture ? (Object.keys(P.region.pillar) as (keyof typeof P.region.pillar)[]).filter((p) => posture[p] === "restricted") : [];

  return (
    <section className="acct-page">
      <h1 className="type-display text-ink">{P.title}</h1>
      {!session.address ? (
        <div className="acct-signed-out">
          <p className="type-body text-ink-secondary">{P.signedOut}</p>
          <PillButton tone="accent" onClick={session.connect}>{P.signIn}</PillButton>
        </div>
      ) : (
        <SignedIn address={session.address} kind={session.kind} />
      )}
      <GroupedList title={P.groups.device}>
        <FeedbackRows />
        <GroupedItem icon={Bell} label={P.notifications} href="/settings/notifications" />
      </GroupedList>
      <GroupedList title={P.groups.region}>
        <div className="kit-item">
          <span className="kit-item-label">{P.region.title}</span>
          <span className="kit-item-detail">{posture === null ? "—" : held.length === 0 ? P.region.open : P.region.restricted(held.map((p) => P.region.pillar[p]).join(", "))}</span>
        </div>
      </GroupedList>
    </section>
  );
}

function SignedIn({ address, kind }: { address: Address; kind: TempoAccountKind | null }) {
  const shell = useWalletShell();
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
  const titles: Record<Drill, string> = { backup: BACKUP.title, keys: P.keys.title, grants: P.grants.title, linked: P.linked.title, x: P.x, delete: DATA.delete.title };

  return (
    <>
      <AccountHero address={address} kind={kind} />
      {ready ? <AccountSummary account={address} /> : null}
      <GroupedList title={P.groups.security}>
        <GroupedItem icon={ShieldCheck} label={BACKUP.title} detail={kind !== "passkey" ? "—" : backups === null ? "…" : backups === 0 ? BACKUP.noneShort : String(backups)} dot={nudge} onClick={() => setDrill("backup")} />
        <GroupedItem icon={KeyRound} label={P.keys.title} detail={keys === null ? "…" : String(keys)} onClick={() => setDrill("keys")} />
        <GroupedItem icon={Wallet} label={P.grants.title} detail={grants === null ? "…" : String(grants)} onClick={() => setDrill("grants")} />
        <GroupedItem icon={Link2} label={P.linked.title} detail={shell.robinhood ? shortAddress(shell.robinhood.address) : P.linked.none} onClick={() => setDrill("linked")} />
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
          {drill === "linked" ? <LinkedBody /> : null}
          {drill === "x" ? <XAccountSheet /> : null}
          {drill === "delete" ? <DeleteSheetBody address={address} /> : null}
        </SlideOverContent>
      </SlideOver>
    </>
  );
}

function LinkedBody(): ReactNode {
  const shell = useWalletShell();
  return (
    <div className="acct-linked">
      <span className="type-body text-ink-secondary">{P.linked.robinhood}</span>
      {shell.robinhood ? (
        <span className="numbers type-body text-ink">{shortAddress(shell.robinhood.address)}</span>
      ) : (
        <PillButton tone="ink" size="sm" onClick={() => shell.openPicker("robinhood")}>{P.linked.link}</PillButton>
      )}
    </div>
  );
}
