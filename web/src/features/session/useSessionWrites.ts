"use client";
/**
 * The owner's own tap-trading writes (root, one passkey confirmation each — D43's "passkey for root actions"): add to
 * the budget, extend or renew, re-key this device, stop. Each is one transaction through the passkey session's tx lane;
 * capital intake and delegation are self-paid, stopping is sponsored (an exit never needs funds). Read back after each.
 */
import type { TxIntent, VaultGrant } from "@cwf/core";
import { useCallback, useState } from "react";
import { useTxLifecycle } from "@/components/tx";
import { nowMs as clockNow } from "@/lib/clock";
import { topUpBase } from "./caps";
import { useSessionActions, useSessionView } from "./context";

export type SessionWrite = "add" | "extend" | "rekey" | "revoke" | null;

const DAY_SEC = 86_400;
const nowSec = () => Math.floor(clockNow() / 1000);

/** A new expiry: `extraSec` past the later of now and the current expiry (an expired grant renews from now). */
export const extendedExpirySec = (grant: VaultGrant, extraSec: number, now = nowSec()) => Math.max(grant.expiresAtSec, now) + extraSec;

export function useSessionWrites() {
  const view = useSessionView();
  const actions = useSessionActions();
  const tx = useTxLifecycle();
  const [busy, setBusy] = useState<SessionWrite>(null);

  const run = useCallback(
    async (which: Exclude<SessionWrite, null>, intent: TxIntent | null) => {
      if (!intent) return null;
      setBusy(which);
      try {
        const outcome = await tx.run(intent);
        if (outcome?.status === "confirmed") await actions.refresh();
        return outcome;
      } finally {
        setBusy(null);
      }
    },
    [tx, actions],
  );

  const grant = view.grant;
  /** Tops the budget up to the daily cap: from the Trading Balance when it holds enough, else straight from the wallet. */
  const addBudget = useCallback(() => {
    if (!grant) return Promise.resolve(null);
    const amountBase = topUpBase(grant);
    const fromBalance = (view.availableBase ?? 0n) >= amountBase;
    return run("add", fromBalance ? { kind: "vault-fund-grant", grantId: grant.grantId, amountBase } : { kind: "vault-deposit-and-fund", grantId: grant.grantId, amountBase });
  }, [grant, view.availableBase, run]);

  /** Same key, same caps, same budget, a later expiry (one tx: the contract returns the old budget and takes it back). */
  const extend = useCallback(
    (extraSec = DAY_SEC) => {
      if (!grant || !view.keyAddress) return Promise.resolve(null);
      return run("extend", { kind: "vault-grant", terms: { kind: "session", actor: view.keyAddress, caps: grant.caps, expiresAtSec: extendedExpirySec(grant, extraSec), budgetBase: grant.budgetBase } });
    },
    [grant, view.keyAddress, run],
  );

  /** A fresh key on this device takes over the grant's caps and budget (after cleared storage or another device). */
  const rekey = useCallback(async () => {
    if (!grant) return null;
    const key = await actions.freshKey();
    if (!key) return null;
    const expiresAtSec = grant.expiresAtSec > nowSec() ? grant.expiresAtSec : nowSec() + DAY_SEC;
    return run("rekey", { kind: "vault-grant", terms: { kind: "session", actor: key, caps: grant.caps, expiresAtSec, budgetBase: grant.budgetBase } });
  }, [grant, actions, run]);

  const revoke = useCallback(() => (grant ? run("revoke", { kind: "vault-revoke", grantId: grant.grantId }) : Promise.resolve(null)), [grant, run]);

  return { tx, busy, addBudget, extend, rekey, revoke };
}
