"use client";
// The keys list (D-053): Active / Stopped (21st 23552), a skeleton only if the read is slow (21st 23557), one-tap revoke
// per key and hold-to-revoke-all (21st 23527) — each a sponsored `key-revoke` through the TxLifecycle, so stopping a key
// never needs funds. Coverage says how far back the chain was read; nothing is claimed beyond it.
import { keyStatus, type KeyState } from "@cwf/markets";
import type { Address, Network } from "@cwf/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TxFailureCard, useTxLifecycle } from "@/components/tx";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SkeletonSwap } from "@/components/ui/skeleton-swap";
import { ACCOUNT_PAGE } from "./copy";
import { KeyRow, whenText } from "./KeyRow";
import { keysQueryKey, useKeys } from "./useKeys";

const K = ACCOUNT_PAGE.keys;
const MAX_PER_TX = 8;

export function KeysSection({ account, network }: { account: Address; network: Network }) {
  const keys = useKeys(account);
  const queryClient = useQueryClient();
  const tx = useTxLifecycle();
  const [filter, setFilter] = useState<"active" | "stopped">("active");
  const [pending, setPending] = useState<readonly string[]>([]);
  const nowSec = BigInt(Math.floor(Date.now() / 1_000));
  const data = keys.data;
  const all = data?.keys ?? [];
  const active = all.filter((k) => keyStatus(k, nowSec) === "active");
  const stopped = all.filter((k) => keyStatus(k, nowSec) !== "active");
  const shown = filter === "active" ? active : stopped;

  async function revoke(targets: readonly KeyState[]) {
    for (let i = 0; i < targets.length; i += MAX_PER_TX) {
      const chunk = targets.slice(i, i + MAX_PER_TX).map((k) => k.keyId as Address);
      setPending(chunk.map((k) => k.toLowerCase()));
      const outcome = await tx.run({ kind: "key-revoke", keyIds: chunk });
      if (outcome?.status !== "confirmed") break;
    }
    setPending([]);
    await queryClient.invalidateQueries({ queryKey: keysQueryKey(account) });
  }

  return (
    <section aria-labelledby="keys-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="keys-title" className="type-title text-ink">{K.title}</h2>
        <SegmentedControl
          label={K.filterLabel}
          value={filter}
          onValueChange={setFilter}
          options={[{ value: "active", label: `${K.active}${data ? ` · ${active.length}` : ""}` }, { value: "stopped", label: `${K.stopped}${data ? ` · ${stopped.length}` : ""}` }]}
        />
      </div>
      <p className="type-caption text-ink-secondary">{K.revokeHint}</p>
      {keys.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="type-body text-ink">{K.unavailable}</p>
          <button type="button" onClick={() => void keys.refetch()} className="min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink">{K.retry}</button>
        </div>
      ) : (
        <SkeletonSwap ready={data !== undefined} lines={4} label={K.loading}>
          {shown.length === 0 ? (
            <p className="type-body text-ink-secondary">{filter === "active" ? K.none : K.noneStopped}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {shown.map((k) => (
                <KeyRow key={k.keyId} keyState={k} nowSec={nowSec} network={network} revoking={pending.includes(k.keyId.toLowerCase())} onRevoke={pending.length ? undefined : () => void revoke([k])} />
              ))}
            </ul>
          )}
        </SkeletonSwap>
      )}
      {tx.state.kind === "failed" ? <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} /> : null}
      {filter === "active" && active.length > 1 ? (
        <HoldToConfirm onConfirm={() => void revoke(active)} confirmLabel={K.revokingAll} disabled={pending.length > 0} className="self-start">
          {K.revokeAll(active.length)}
        </HoldToConfirm>
      ) : null}
      {data ? (
        <p className="type-caption text-ink-secondary" aria-live="polite">
          {data.coverage.complete ? K.complete : data.coverage.fromTimeSec ? K.scanning(whenText(data.coverage.fromTimeSec)) : K.loading}
        </p>
      ) : null}
    </section>
  );
}
