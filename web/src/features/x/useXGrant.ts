"use client";
// Ported from Owarine 90a91d71:web/src/features/x/useXGrant.ts — S11 (D-227): the X balance is an EXECUTOR grant on the
// account's Trading Balance (EventVaultV2), naming the running relay's executor. Fund = deposit + grant in one root
// transaction the first time (then deposit + top-up), cash out = revoke (the budget returns to the Trading Balance),
// renew = revoke then grant the returned budget again. Caps are the vault's: the budget, 8 open Windows, 30 days.
import { USD_DECIMALS, X_GRANT, xGrantCaps, xPermissionState, type Address, type GrantTerms, type TxOutcome, type VaultGrant, type XPermissionState } from "@cwf/core";
import { invalidateAfterWrite, useVaultSnapshot } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTxLifecycle, type TxRunner } from "@/components/tx";
import { useRootSubmitter } from "@/features/session/context";
import { useWalletSession } from "@/lib/wallet-session";

export type XGrantBusy = "" | "fund" | "cashout" | "renew";

export interface XGrantState {
  /** null while unread; false where the Trading Balance isn't deployed. */
  deployed: boolean | null;
  /** The live (not revoked) EXECUTOR grant, expired or not — an expired one still holds funds to recover. */
  grant: VaultGrant | null;
  balanceBase: bigint | null;
  /** What sits unallocated in the Trading Balance (a top-up can come from it). */
  availableBase: bigint | null;
  readable: boolean;
  busy: XGrantBusy;
  tx: TxRunner;
  permission: (executor: string | null) => XPermissionState;
  fund: (amountBase: bigint, executor: Address) => Promise<TxOutcome | null>;
  cashOut: () => Promise<TxOutcome | null>;
  renew: (executor: Address) => Promise<TxOutcome | null>;
}

const termsOf = (executor: Address, budgetBase: bigint, nowSec: number): GrantTerms => ({ kind: "executor", actor: executor, caps: xGrantCaps(), expiresAtSec: nowSec + X_GRANT.days * 86_400, budgetBase });

export function useXGrant(): XGrantState {
  const { address } = useWalletSession();
  const root = useRootSubmitter();
  const tx = useTxLifecycle(root ? { submitter: root } : {});
  const queryClient = useQueryClient();
  const snapshot = useVaultSnapshot(address);
  const [busy, setBusy] = useState<XGrantBusy>("");
  const value = snapshot?.ok ? snapshot.value : null;
  const readable = Boolean(snapshot?.ok && !snapshot.stale && value);
  const deployed = snapshot?.ok ? value !== null && value.deployment.version === 2 : null;
  const grant = value?.grants.executor && !value.grants.executor.revoked ? value.grants.executor : null;

  const after = async () => {
    setBusy("");
    if (address) await invalidateAfterWrite(queryClient, { wallet: address }).catch(() => undefined);
  };
  const run = async (kind: Exclude<XGrantBusy, "">, work: () => Promise<TxOutcome | null>) => {
    if (busy || !readable) return null;
    setBusy(kind);
    try {
      return await work();
    } finally {
      await after();
    }
  };

  return {
    deployed,
    grant,
    balanceBase: grant ? grant.budgetBase : deployed ? 0n : null,
    availableBase: value ? value.account.availableBase : null,
    readable,
    busy,
    tx,
    permission: (executor) => (!readable ? "checking" : xPermissionState(grant, executor, Math.floor(Date.now() / 1000))),
    fund: (amountBase, executor) =>
      run("fund", async () => {
        const nowSec = Math.floor(Date.now() / 1000);
        const live = grant && grant.actor.toLowerCase() === executor.toLowerCase() && grant.expiresAtSec > nowSec;
        if (live) return tx.run({ kind: "vault-deposit-and-fund", grantId: grant.grantId, amountBase });
        return tx.run({ kind: "vault-deposit-and-grant", amountBase, terms: termsOf(executor, amountBase, nowSec) });
      }),
    cashOut: () => run("cashout", async () => (grant ? tx.run({ kind: "vault-revoke", grantId: grant.grantId }) : null)),
    renew: (executor) =>
      run("renew", async () => {
        if (!grant) return null;
        const budget = grant.budgetBase;
        const stopped = await tx.run({ kind: "vault-revoke", grantId: grant.grantId });
        if (stopped?.status !== "confirmed" || budget <= 0n) return stopped;
        // The returned budget sits in the Trading Balance: the new grant takes exactly it, no new deposit.
        return tx.run({ kind: "vault-grant", terms: termsOf(executor, budget, Math.floor(Date.now() / 1000)) });
      }),
  };
}

export const X_DECIMALS = USD_DECIMALS;
