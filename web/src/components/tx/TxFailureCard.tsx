"use client";

/**
 * The failure card (D-045, fidelity list 2): the diagnosis in human words, whether money moved — always — then the fix
 * (retry, add funds) and the technical details behind a disclosure. No raw technical text in the headline (§2.5).
 */
import type { TxState } from "@cwf/core";
import { diagnosisCopy } from "@/lib/copy";
import { openFunds } from "@/lib/funds-event";
import { cn } from "@/lib/utils";
import { TX } from "./copy";

type Failed = Extract<TxState, { kind: "failed" }>;

export function TxFailureCard({ state, onRetry, explorerHref, className }: { state: Failed; onRetry?: () => void; explorerHref?: string | null; className?: string }) {
  const copy = diagnosisCopy(state.diagnosis.kind);
  const needsFunds = state.diagnosis.kind === "fee-token" || state.diagnosis.kind === "insufficient-collateral";
  return (
    <div role="alert" className={cn("flex flex-col gap-3 rounded-lg border border-hairline bg-surface-1 p-4", className)}>
      <div className="flex flex-col gap-1">
        <p className="type-body-strong text-ink">{copy.headline}</p>
        <p className="type-body text-ink-secondary">{copy.body}</p>
        <p className="type-body-strong text-ink">{TX.moneyMoved[state.moneyMoved]}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {needsFunds ? (
          <button type="button" onClick={openFunds} className="min-h-touch rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">
            Add funds
          </button>
        ) : null}
        {onRetry && state.diagnosis.retryable ? (
          <button type="button" onClick={onRetry} className="min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink">
            {TX.retry}
          </button>
        ) : null}
        {explorerHref ? (
          <a href={explorerHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-touch items-center px-2 type-caption text-ink! underline underline-offset-4">
            {TX.explorer}
          </a>
        ) : null}
      </div>
      <details className="type-caption text-ink-secondary">
        <summary className="min-h-touch cursor-pointer py-2">{TX.technical}</summary>
        <pre className="numbers mt-1 overflow-x-auto whitespace-pre-wrap">
          {state.diagnosis.kind}
          {state.diagnosis.errorName ? ` · ${state.diagnosis.errorName}` : ""}
          {state.txHash ? `\n${state.txHash}` : ""}
          {"\n"}
          {state.diagnosis.technical}
        </pre>
      </details>
    </div>
  );
}
