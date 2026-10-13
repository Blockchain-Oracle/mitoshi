"use client";

/**
 * The failure card (D-045, fidelity list 2): the diagnosis in human words, whether money moved — always — then the fix
 * and the technical details behind a disclosure. No raw technical text in the headline (§2.5). R6 (D-230, T19/T20): the
 * write voice; the fix comes from the diagnosis (`fixForDiagnosis` + `fixLabel`, "Add money" from one source, never a
 * literal here); every action is a kit pill.
 */
import type { TxState } from "@cwf/core";
import { diagnosisCopy, fixForDiagnosis, fixLabel } from "@cwf/core/copy";
import { PillButton } from "@/components/kit/PillButton";
import { useFixRunner } from "@/components/states/BlockedCta";
import { cn } from "@/lib/utils";
import { TX } from "./copy";

type Failed = Extract<TxState, { kind: "failed" }>;

export function TxFailureCard({ state, onRetry, explorerHref, className }: { state: Failed; onRetry?: () => void; explorerHref?: string | null; className?: string }) {
  const copy = diagnosisCopy(state.diagnosis.kind, "write");
  const fix = fixForDiagnosis(state.diagnosis.kind, state.diagnosis.retryable);
  const run = useFixRunner(onRetry ? (f) => f.kind === "retry" && onRetry() : undefined);
  const action = fix ? run(fix) : null;
  return (
    <div role="alert" className={cn("flex flex-col gap-3 rounded-lg border border-hairline bg-surface-1 p-4", className)}>
      <div className="flex flex-col gap-1">
        <p className="type-body-strong text-ink">{copy.headline}</p>
        <p className="type-body text-ink-secondary">{copy.body}</p>
        <p className="type-body-strong text-ink">{TX.moneyMoved[state.moneyMoved]}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {fix && action ? (
          <PillButton tone={fix.kind === "retry" ? "ink" : "accent"} size="sm" onClick={action}>
            {fix.kind === "retry" ? TX.retry : fixLabel(fix)}
          </PillButton>
        ) : null}
        {onRetry && state.diagnosis.retryable && fix?.kind !== "retry" ? (
          <PillButton tone={fix ? "ghost" : "ink"} size="sm" onClick={onRetry}>{TX.retry}</PillButton>
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
