"use client";

import { diagnosis, type TxState } from "@cwf/core";
import { KeyUsedReceipt, TxChips, TxCta, TxFailureCard, TxReceipt, TypedConfirm } from "@/components/tx";
import { notify } from "@/lib/toast";

const HASH = `0x${"3f".repeat(32)}` as const;
const STATES: { label: string; state: TxState }[] = [
  { label: "idle", state: { kind: "idle" } },
  { label: "blocked", state: { kind: "blocked", reason: "Enter a stake" } },
  { label: "signing", state: { kind: "signing" } },
  { label: "submitted", state: { kind: "submitted", txHash: null, validBeforeSec: 25 } },
  { label: "confirmed (pending)", state: { kind: "confirmed", txHash: HASH, pending: true } },
  { label: "unknown", state: { kind: "unknown", txHash: null, validBeforeSec: 25 } },
  { label: "confirmed", state: { kind: "confirmed", txHash: HASH, pending: false } },
];

export function TxFixtures() {
  return (
    <div className="flex flex-col gap-8">
      {STATES.map(({ label, state }) => (
        <section key={label} className="flex flex-col gap-2" aria-label={label}>
          <h2 className="type-label-micro text-ink-secondary">{label}</h2>
          <TxChips state={state} />
          <TxCta state={state} action="Buy UP for $5.00" signer="passkey" sponsored onConfirm={() => undefined} />
        </section>
      ))}
      <TxFailureCard state={{ kind: "failed", diagnosis: diagnosis("user-rejected", "NotAllowedError"), moneyMoved: "no", txHash: null }} onRetry={() => undefined} />
      <TxFailureCard state={{ kind: "failed", diagnosis: diagnosis("fee-token", "InsufficientFeeTokenBalance"), moneyMoved: "no", txHash: null }} />
      <TxFailureCard state={{ kind: "failed", diagnosis: diagnosis("send-unknown", "timeout"), moneyMoved: "unknown", txHash: HASH }} explorerHref="https://explore.testnet.tempo.xyz" />
      <TxReceipt title="Settlement receipt" figure="$9.40" figureLabel="Paid" atMs={1_790_000_000_000} txHash={HASH} network="testnet" rows={[{ label: "Window", value: "TSLA 5m" }]} />
      <KeyUsedReceipt keyLabel="One-tap key on this browser" leftText="$18.00" limitText="$25.00" expiresText="in 23 h" />
      <TypedConfirm code="USD" onMatch={() => undefined} />
      <button type="button" className="min-h-touch self-start rounded-md border border-border-strong px-4 type-body-strong text-ink" onClick={() => notify.neutral("Write landed", "The receipt is in your history.")}>
        Raise a toast
      </button>
    </div>
  );
}
