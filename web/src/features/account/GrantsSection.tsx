"use client";
// R4-11 (D-227): the body of the account page's "Trading Balance grants" sheet, one row per grant, one footnote.
// The Trading Balance's grants on the trust surface (D44, UX-07; Masayume 68f7a09:web/src/features/vault/VaultGrants.tsx
// "grants you allow" + the session manager's details): every live grant with what it may do, what is left, when it
// ends and which key holds it, each stoppable in one step (the relay pays — an exit never needs funds), hold-to-stop-all
// (21st 23527, reused) when there are several, and the stopped ones from the index with their transactions.
import { GRANT_KIND_INDEX, type Address, type Network, type VaultGrant } from "@cwf/core";
import { txUrl } from "@cwf/core";
import { shortHex } from "@cwf/core/units";
import { useVaultSnapshot } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Masked } from "@/components/kit/Masked";
import { notifyReceipt } from "@/features/receipts/write-receipt";
import { MotionScope } from "@/components/motion-scope";
import { TxFailureCard, useTxLifecycle } from "@/components/tx";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { PillButton } from "@/components/kit/PillButton";
import { exitAllowanceText, leftNowBase, usd } from "@/features/session/caps";
import { useSessionActions, useSessionView } from "@/features/session/context";
import { ACCOUNT_PAGE } from "./copy";
import { whenText } from "./KeyRow";
import "@/components/kit/kit.css";

const G = ACCOUNT_PAGE.grants;

interface GrantHistoryRow { grant_id: string; kind: number; actor: string; revoked: boolean; expires_at_sec: string; spent_base: string; taps: number; created_tx: string; revoked_tx: string | null; returned_base: string | null }

function useGrantHistory(owner: Address) {
  return useQuery({
    queryKey: ["account-grants", owner.toLowerCase()],
    queryFn: async () => {
      const response = await fetch(`/api/index/wallet/${owner}/vault`);
      if (!response.ok) throw new Error(`vault index ${response.status}`);
      const { rows } = (await response.json()) as { rows: { grants: GrantHistoryRow[] }[] };
      return rows[0]?.grants ?? [];
    },
    staleTime: 15_000,
  });
}

/** The grants that can still act (not revoked), from a vault snapshot. */
export function liveGrantsOf(snapshot: { grants: Record<string, VaultGrant | null> }): VaultGrant[] {
  return Object.values(snapshot.grants).filter((g): g is VaultGrant => g !== null && !g.revoked);
}

/** The settings row's count; null until the Trading Balance has been read (0 where it isn't deployed). */
export function useGrantCounts(account: Address): number | null {
  const snap = useVaultSnapshot(account);
  if (!snap) return null;
  return snap.ok && snap.value ? liveGrantsOf(snap.value).length : 0;
}

// One grouped row per grant (Owarine 90a91d71:web/src/features/vault/VaultGrants.tsx, R4-11): the kind and a "this
// device" tag, its caps as chips, what is left today, and Stop. While a stop runs every Stop is disabled.
function LiveGrant({ grant, thisDevice, nowSec, onStop, stopping, busy }: { grant: VaultGrant; thisDevice: boolean; nowSec: number; onStop: () => void; stopping: boolean; busy: boolean }) {
  const expired = grant.expiresAtSec < nowSec;
  return (
    <li className="acct-grant">
      <div className="acct-grant-main">
        <span className="type-body-strong text-ink">
          {G.kind[grant.kind]}
          {thisDevice ? <span className="acct-tag">{G.thisDevice}</span> : null}
          {expired ? <span className="acct-tag">{G.expired}</span> : null}
        </span>
        <span className="acct-grant-chips numbers">
          {grant.kind === "exit"
            ? G.exitScope(grant.exitToleranceBps !== undefined ? exitAllowanceText(grant.exitToleranceBps, grant.exitSlackBps) : null, grant.caps.market ? shortHex(grant.caps.market) : null)
            : G.scopeValue(usd(grant.caps.maxStakePerTradeBase), usd(grant.caps.maxDailySpendBase), grant.caps.maxOpenPositions)}
        </span>
        <span className="acct-grant-meta numbers">
          {grant.kind === "exit" ? null : <>{G.left} <Masked>{usd(leftNowBase(grant, nowSec))}</Masked> · </>}
          {G.expires} {whenText(BigInt(grant.expiresAtSec))} · {G.key} {shortHex(grant.actor)}
        </span>
      </div>
      <PillButton tone="ghost" size="sm" onClick={onStop} disabled={busy} aria-busy={stopping}>
        {stopping ? G.stopping : G.stop}
      </PillButton>
    </li>
  );
}

export function GrantsSection({ account, network }: { account: Address; network: Network }) {
  const snap = useVaultSnapshot(account);
  const history = useGrantHistory(account);
  const view = useSessionView();
  const actions = useSessionActions();
  const tx = useTxLifecycle();
  const [stopping, setStopping] = useState<string[]>([]);
  const nowSec = Math.floor(Date.now() / 1000);
  const snapshot = snap?.ok ? snap.value : null;
  const live = snapshot ? liveGrantsOf(snapshot) : [];
  const liveIds = new Set(live.map((g) => g.grantId.toString()));
  const stopped = (history.data ?? []).filter((g) => !liveIds.has(g.grant_id));

  async function stop(grants: readonly VaultGrant[]) {
    for (const g of grants) {
      setStopping([g.grantId.toString()]);
      const outcome = await tx.run({ kind: "vault-revoke", grantId: g.grantId });
      if (outcome?.status !== "confirmed") break;
      // The success receipt (R4-4, D-227; critic gap 21): the grant stopped, its budget back in the Trading Balance.
      notifyReceipt({ title: G.receipt(G.kindByIndex[GRANT_KIND_INDEX[g.kind]] ?? g.kind), figure: usd(g.budgetBase), figureLabel: G.receiptLabel, txHash: outcome.txHash, atMs: Date.now(), signer: "passkey", sponsored: true });
    }
    setStopping([]);
    await actions.refresh();
    await history.refetch();
  }

  return (
    <MotionScope>
      <section aria-label={G.title} className="flex flex-col gap-4">
        {snap === null ? <p className="type-body text-ink-secondary" aria-busy="true">{G.loading}</p> : null}
        {snap && !snap.ok ? <p role="alert" className="type-body text-ink">{G.unavailable}</p> : null}
        {snap?.ok && snapshot === null ? <p className="type-body text-ink-secondary">{G.notDeployed}</p> : null}
        {snapshot && live.length === 0 ? <p className="type-body text-ink-secondary">{G.none}</p> : null}
        {live.length > 0 ? (
          <ul className="acct-grants">
            {live.map((g) => (
              <LiveGrant key={g.grantId.toString()} grant={g} nowSec={nowSec} thisDevice={view.keyAddress !== null && g.actor.toLowerCase() === view.keyAddress.toLowerCase()} stopping={stopping.includes(g.grantId.toString())} busy={stopping.length > 0} onStop={() => void stop([g])} />
            ))}
          </ul>
        ) : null}
        {live.length > 0 ? <p className="type-caption text-ink-secondary">{G.note}</p> : null}
        {tx.state.kind === "failed" ? <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} /> : null}
        {live.length > 1 ? (
          <HoldToConfirm onConfirm={() => void stop(live)} confirmLabel={G.stopping} disabled={stopping.length > 0} className="self-start">{G.stopAll(live.length)}</HoldToConfirm>
        ) : null}
        {stopped.length > 0 ? (
          <details>
            <summary className="min-h-touch py-2 type-caption text-ink">{G.history(stopped.length)}</summary>
            <ul className="flex flex-col gap-2 pt-2">
              {stopped.map((g) => (
                <li key={g.grant_id} className="flex flex-wrap items-center justify-between gap-2 type-caption text-ink-secondary">
                  <span>#{g.grant_id} · {G.kindByIndex[g.kind] ?? G.kindByIndex[0]} · {g.revoked ? G.stoppedReturned(usd(BigInt(g.returned_base ?? "0"))) : G.expiredAt(whenText(BigInt(g.expires_at_sec)))} · {G.taps(g.taps)}</span>
                  <a className="numbers underline decoration-dotted underline-offset-4" href={txUrl((g.revoked_tx ?? g.created_tx) as `0x${string}`, network)} target="_blank" rel="noreferrer">{shortHex(g.revoked_tx ?? g.created_tx)}</a>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </MotionScope>
  );
}
