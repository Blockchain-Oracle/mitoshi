"use client";
// The Trading Balance's grants on the trust surface (D44, UX-07; Masayume 68f7a09:web/src/features/vault/VaultGrants.tsx
// "grants you allow" + the session manager's details): every live grant with what it may do, what is left, when it
// ends and which key holds it, each stoppable in one step (the relay pays — an exit never needs funds), hold-to-stop-all
// (21st 23527, reused) when there are several, and the stopped ones from the index with their transactions.
import type { Address, Network, VaultGrant } from "@cwf/core";
import { txUrl } from "@cwf/core";
import { shortHex } from "@cwf/core/units";
import { useVaultSnapshot } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MotionScope } from "@/components/motion-scope";
import { TxFailureCard, useTxLifecycle } from "@/components/tx";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { leftNowBase, spentTodayBase, usd } from "@/features/session/caps";
import { useSessionActions, useSessionView } from "@/features/session/context";
import { ACCOUNT_PAGE } from "./copy";
import { whenText } from "./KeyRow";

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

function LiveGrant({ grant, thisDevice, nowSec, onStop, stopping }: { grant: VaultGrant; thisDevice: boolean; nowSec: number; onStop?: () => void; stopping: boolean }) {
  const expired = grant.expiresAtSec < nowSec;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="type-body-strong text-ink">{G.kind[grant.kind]}{thisDevice ? ` · ${G.thisDevice}` : ""}</span>
          <span className="numbers type-caption text-ink-secondary">{G.key} {shortHex(grant.actor)} · #{grant.grantId.toString()}</span>
        </div>
        <span className="rounded-full border border-border-strong px-2 py-0.5 type-label-micro text-ink">{expired ? G.expired : G.active}</span>
      </div>
      <dl className="grid grid-cols-1 gap-1 type-caption text-ink-secondary sm:grid-cols-2">
        <div><dt className="inline">{G.scope}: </dt><dd className="inline text-ink">{G.scopeValue(usd(grant.caps.maxStakePerTradeBase), usd(grant.caps.maxDailySpendBase), grant.caps.maxOpenPositions)}</dd></div>
        <div><dt className="inline">{G.left}: </dt><dd className="numbers inline text-ink">{G.leftValue(usd(leftNowBase(grant, nowSec)), usd(grant.budgetBase))}</dd></div>
        <div><dt className="inline">{G.spentToday}: </dt><dd className="numbers inline text-ink">{usd(spentTodayBase(grant, nowSec))}</dd></div>
        <div><dt className="inline">{G.expires}: </dt><dd className="inline text-ink">{whenText(BigInt(grant.expiresAtSec))}</dd></div>
      </dl>
      <p className="type-caption text-ink-secondary">{G.never}</p>
      {onStop ? (
        <button type="button" onClick={onStop} disabled={stopping} className="min-h-touch self-start rounded-md border border-border-strong px-4 type-body-strong text-ink disabled:opacity-50">
          {stopping ? G.stopping : G.stop}
        </button>
      ) : null}
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
  const live = snapshot ? (Object.values(snapshot.grants).filter((g): g is VaultGrant => g !== null && !g.revoked)) : [];
  const liveIds = new Set(live.map((g) => g.grantId.toString()));
  const stopped = (history.data ?? []).filter((g) => !liveIds.has(g.grant_id));

  async function stop(grants: readonly VaultGrant[]) {
    for (const g of grants) {
      setStopping([g.grantId.toString()]);
      const outcome = await tx.run({ kind: "vault-revoke", grantId: g.grantId });
      if (outcome?.status !== "confirmed") break;
    }
    setStopping([]);
    await actions.refresh();
    await history.refetch();
  }

  return (
    <MotionScope>
      <section aria-labelledby="grants-title" className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface-1 p-4">
        <h2 id="grants-title" className="type-title text-ink">{G.title}</h2>
        <p className="type-caption text-ink-secondary">{G.note}</p>
        {snap === null ? <p className="type-body text-ink-secondary" aria-busy="true">{G.loading}</p> : null}
        {snap && !snap.ok ? <p role="alert" className="type-body text-ink">{G.unavailable}</p> : null}
        {snap?.ok && snapshot === null ? <p className="type-body text-ink-secondary">{G.notDeployed}</p> : null}
        {snapshot && live.length === 0 ? <p className="type-body text-ink-secondary">{G.none}</p> : null}
        {live.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {live.map((g) => (
              <LiveGrant key={g.grantId.toString()} grant={g} nowSec={nowSec} thisDevice={view.keyAddress !== null && g.actor.toLowerCase() === view.keyAddress.toLowerCase()} stopping={stopping.includes(g.grantId.toString())} onStop={stopping.length ? undefined : () => void stop([g])} />
            ))}
          </ul>
        ) : null}
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
