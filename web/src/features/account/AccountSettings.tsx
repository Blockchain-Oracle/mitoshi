"use client";
// `/settings/account`, the trust surface (D-053) — S1's shell: the account and its owner, every key the chain knows
// with its live limits and one-step revoke, where Trading Balance grants will appear (S7), linked wallets and the
// region posture. S4 adds the wallet key, S7 grants, S9/S11/S12b/S16 their keys; S13 completes it.
import { useEffect, useState } from "react";
import type { RegionPosture } from "@cwf/core";
import { webEnv } from "@/lib/env";
import { readRegionPosture } from "@/lib/region-mark";
import { useWalletSession } from "@/lib/wallet-session";
import { FirstUseHint } from "@/features/onboarding/FirstUseHint";
import { ACCOUNT } from "@/providers/wallet/copy";
import { shortAddress } from "@/providers/wallet/format";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { ACCOUNT_PAGE } from "./copy";
import { KeysSection } from "./KeysSection";

const P = ACCOUNT_PAGE;
const card = "flex flex-col gap-2 rounded-lg border border-hairline bg-surface-1 p-4";

export function AccountSettings() {
  const session = useWalletSession();
  const shell = useWalletShell();
  const network = webEnv.markets.network;
  const [posture, setPosture] = useState<RegionPosture | null>(null);
  useEffect(() => setPosture(readRegionPosture()), []);
  const held = posture ? (Object.keys(P.region.pillar) as (keyof typeof P.region.pillar)[]).filter((p) => posture[p] === "restricted") : [];

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-gutter py-8 lg:px-gutter-desktop">
      {/* Masayume's page heading (eyebrow + title) lives under `.capability-pending`; its box rules are reset here. */}
      <header className="capability-pending m-0! flex max-w-none! flex-col gap-2 p-0!">
        <p className="cp-eyebrow">{P.eyebrow}</p>
        <h1 className="cp-title">{P.title}</h1>
        <FirstUseHint id="keys" className="mt-2" />
      </header>

      {!session.address ? (
        <div className={card}>
          <p className="type-body text-ink-secondary">{P.signedOut}</p>
          <button type="button" onClick={session.connect} className="min-h-touch self-start rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">{P.signIn}</button>
        </div>
      ) : (
        <>
          <section aria-labelledby="acct-title" className={card}>
            <h2 id="acct-title" className="type-title text-ink">{P.account.title}</h2>
            <dl className="grid grid-cols-1 gap-1 type-body sm:grid-cols-[auto_1fr] sm:gap-x-4">
              <dt className="text-ink-secondary">{P.account.address}</dt>
              <dd className="numbers min-w-0 break-all text-ink">{session.address}</dd>
              <dt className="text-ink-secondary">{P.account.signIn}</dt>
              <dd className="text-ink">{session.kind ? ACCOUNT.kinds[session.kind] : "—"}</dd>
            </dl>
            <p className="type-caption text-ink-secondary">{session.kind === "passkey" ? P.account.passkeyNote : P.account.walletNote}</p>
          </section>

          <KeysSection account={session.address} network={network} />

          <section aria-labelledby="grants-title" className={card}>
            <h2 id="grants-title" className="type-title text-ink">{P.grants.title}</h2>
            <p className="type-body text-ink-secondary">{P.grants.pending}</p>
          </section>

          <section aria-labelledby="linked-title" className={card}>
            <h2 id="linked-title" className="type-title text-ink">{P.linked.title}</h2>
            <div className="flex flex-wrap items-center justify-between gap-2 type-body">
              <span className="text-ink-secondary">{P.linked.robinhood}</span>
              {shell.robinhood ? (
                <span className="numbers text-ink">{shortAddress(shell.robinhood.address)}</span>
              ) : (
                <button type="button" onClick={() => shell.openPicker("robinhood")} className="min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink">{P.linked.link}</button>
              )}
            </div>
          </section>
        </>
      )}

      <section aria-labelledby="region-title" className={card}>
        <h2 id="region-title" className="type-title text-ink">{P.region.title}</h2>
        <p className="type-body text-ink-secondary">{posture === null ? "—" : held.length === 0 ? P.region.open : P.region.restricted(held.map((p) => P.region.pillar[p]).join(", "))}</p>
      </section>
    </section>
  );
}
