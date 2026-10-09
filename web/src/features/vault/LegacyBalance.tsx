"use client";
// The previous Trading Balances (S24.2; D-213): once a new vault is the current one, what an earlier one still holds is
// the owner's to take out — its free balance withdrawn to the account (sponsored, the owner signs), and an old
// tap-trading key's budget stopped back into it first. Positions left there keep settling into it (the settler cranks
// every vault), so a card comes back when a payout lands. One card per previous vault that holds anything; none
// otherwise.
import { useLegacyVaultSnapshots } from "@cwf/markets/react";
import type { Address, VaultSnapshot } from "@cwf/core";
import { useQueryClient } from "@tanstack/react-query";
import { useTxLifecycle } from "@/components/tx";
import { useRootSubmitter } from "@/features/session/context";
import { usd } from "@/features/session/caps";
import { notify } from "@/lib/toast";
import { VAULT } from "./copy";

const L = VAULT.legacy;
const BTN = "min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink disabled:opacity-50";

export function LegacyBalance({ owner }: { owner: Address | null }) {
  const reading = useLegacyVaultSnapshots(owner);
  if (!owner || !reading?.ok) return null;
  return (
    <>
      {reading.value.map((snap) => (
        <LegacyVault key={snap.deployment.eventVault} snap={snap} />
      ))}
    </>
  );
}

function LegacyVault({ snap }: { snap: VaultSnapshot }) {
  const root = useRootSubmitter();
  const withdraw = useTxLifecycle({ submitter: root });
  const stop = useTxLifecycle({ submitter: root });
  const queryClient = useQueryClient();
  const free = snap.account.availableBase;
  const grant = snap.grants.session && !snap.grants.session.revoked && snap.grants.session.budgetBase > 0n ? snap.grants.session : null;
  if (free === 0n && !grant) return null;
  const vault = snap.deployment.eventVault;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["cwf"] });
  const busy = withdraw.state.kind === "signing" || withdraw.state.kind === "submitted" || stop.state.kind === "signing" || stop.state.kind === "submitted";
  const runStop = async () => {
    if (!grant) return;
    const out = await stop.run({ kind: "vault-revoke", grantId: grant.grantId, vault });
    if (out?.status === "confirmed") (notify.neutral(L.stopped), void refresh());
  };
  const runWithdraw = async () => {
    const out = await withdraw.run({ kind: "vault-withdraw", amountBase: free, vault });
    if (out?.status === "confirmed") (notify.neutral(L.withdrawn), void refresh());
  };
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border-strong bg-surface-1 p-4" aria-label={L.title}>
      <span className="type-body-strong text-ink">{L.title}</span>
      <p className="type-caption text-ink-secondary">{L.body(usd(free + (grant?.budgetBase ?? 0n)))}</p>
      {grant ? <p className="type-caption text-ink-secondary">{L.key(usd(grant.budgetBase))}</p> : null}
      <div className="flex flex-wrap gap-2">
        {grant ? <button type="button" className={BTN} disabled={busy} onClick={() => void runStop()}>{L.stop}</button> : null}
        {free > 0n ? <button type="button" className={BTN} disabled={busy} onClick={() => void runWithdraw()}>{L.withdraw(usd(free))}</button> : null}
      </div>
    </section>
  );
}
