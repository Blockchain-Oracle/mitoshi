"use client";
// The account page's head and its first-fold strip (R4-11, D-227). The hero reuses the account menu's `am-head` and
// `am-rows` (ported from Owarine 90a91d71:web/src/features/canton-ux/seat/SeatAccountMenu.tsx: avatar, kind, the
// network chip, the short address with copy). The strip counts what can spend for this account — active keys, live
// grants, what they may still spend today — and holds one "Stop all": the keys revoked in chunks of eight, then the
// grants, each a sponsored transaction through the TxLifecycle (stopping never needs funds).
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import type { Address } from "@cwf/core";
import { useVaultSnapshot } from "@cwf/markets/react";
import { TxFailureCard, useTxLifecycle } from "@/components/tx";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { Masked } from "@/components/kit/Masked";
import { notifyReceipt } from "@/features/receipts/write-receipt";
import { GRANT_KIND_INDEX } from "@cwf/core";
import { AccountAvatar } from "@/components/shell/header/AccountAvatar";
import { leftNowBase, usd } from "@/features/session/caps";
import { useSessionActions } from "@/features/session/context";
import { ACCOUNT } from "@/providers/wallet/copy";
import { shortAddress } from "@/providers/wallet/format";
import { forgetWalletKey } from "@/providers/wallet/wallet-key-store";
import { TEMPO_CHAIN_ID } from "@/providers/wallet/chain-id";
import { useWalletShell, type TempoAccountKind } from "@/providers/wallet/wallet-shell-context";
import { ACCOUNT_PAGE } from "./copy";
import { liveGrantsOf } from "./GrantsSection";
import { keysQueryKey, useActiveKeys } from "./useKeys";
import "@/components/kit/kit.css";

const P = ACCOUNT_PAGE;
const MAX_PER_TX = 8;

export function AccountHero({ address, kind }: { address: Address; kind: TempoAccountKind | null }) {
  const shell = useWalletShell();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className="acct-hero">
      <div className="am-head">
        <AccountAvatar seed={address} size={36} />
        <span className="am-name">{kind ? ACCOUNT.kinds[kind] : "—"}</span>
        <span className="am-chip">
          <span aria-hidden className="am-chip-dot" />
          {ACCOUNT.network[shell.network]}
        </span>
      </div>
      <dl className="am-rows">
        <div className="am-row">
          <dt>{P.account.address}</dt>
          <dd>
            <span className="flex min-w-0 items-center gap-1">
              <span className="numbers truncate">{shortAddress(address)}</span>
              <button type="button" className="am-copy" aria-label={copied ? P.account.copied : P.account.copy} title={copied ? P.account.copied : P.account.copy} onClick={() => void navigator.clipboard?.writeText(address).then(() => setCopied(true), () => undefined)}>
                {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
              </button>
            </span>
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function AccountSummary({ account }: { account: Address }) {
  const keys = useActiveKeys(account);
  const snap = useVaultSnapshot(account);
  const grants = snap?.ok && snap.value ? liveGrantsOf(snap.value) : null;
  const deviceKey = useWalletShell().walletKey;
  const actions = useSessionActions();
  const queryClient = useQueryClient();
  const tx = useTxLifecycle();
  const [busy, setBusy] = useState(false);
  const nowSec = Math.floor(Date.now() / 1_000);
  const leftToday = grants?.filter((g) => g.kind !== "exit").reduce((sum, g) => sum + leftNowBase(g, nowSec), 0n) ?? null;
  const total = (keys?.length ?? 0) + (grants?.length ?? 0);

  async function stopAll() {
    setBusy(true);
    const ks = keys ?? [];
    let ok = true;
    for (let i = 0; ok && i < ks.length; i += MAX_PER_TX) {
      const outcome = await tx.run({ kind: "key-revoke", keyIds: ks.slice(i, i + MAX_PER_TX).map((k) => k.keyId as Address) });
      ok = outcome?.status === "confirmed";
    }
    if (ok && deviceKey && ks.some((k) => k.keyId.toLowerCase() === deviceKey.keyId.toLowerCase())) forgetWalletKey(TEMPO_CHAIN_ID, account);
    for (const g of grants ?? []) {
      if (!ok) break;
      const outcome = await tx.run({ kind: "vault-revoke", grantId: g.grantId });
      ok = outcome?.status === "confirmed";
      // The same success receipt as one grant's Stop (R4-4): the budget back in the Trading Balance.
      if (outcome?.status === "confirmed") notifyReceipt({ title: P.grants.receipt(P.grants.kindByIndex[GRANT_KIND_INDEX[g.kind]] ?? g.kind), figure: usd(g.budgetBase), figureLabel: P.grants.receiptLabel, txHash: outcome.txHash, atMs: Date.now(), signer: "passkey", sponsored: true });
    }
    setBusy(false);
    await Promise.all([queryClient.invalidateQueries({ queryKey: keysQueryKey(account) }), actions.refresh()]);
  }

  return (
    <div className="acct-summary" aria-live="polite">
      <p className="acct-summary-line numbers">
        <span>{keys === null ? "…" : P.summary.keys(keys.length)}</span>
        <span aria-hidden>·</span>
        <span>{grants === null ? "…" : P.summary.grants(grants.length)}</span>
        {leftToday !== null && leftToday > 0n ? (
          <>
            <span aria-hidden>·</span>
            <span><Masked>{P.summary.left(usd(leftToday))}</Masked></span>
          </>
        ) : null}
      </p>
      {total > 0 ? (
        <HoldToConfirm onConfirm={() => void stopAll()} confirmLabel={P.summary.stopping} disabled={busy} className="acct-summary-stop">
          {P.summary.stopAll}
        </HoldToConfirm>
      ) : null}
      {tx.state.kind === "failed" ? <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} /> : null}
    </div>
  );
}
