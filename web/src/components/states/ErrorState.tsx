"use client";
// Ported from Masayume 68f7a09:web/src/components/states/ErrorState.tsx. R4-0 (D-227): no retry for a contract that isn't
// deployed — no retry can deploy it (Owarine guards the same) — and the funding way out says "Add money", as the app does.

import type { Diagnosis } from "@cwf/core";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { openFunds } from "@/lib/funds-event";
import { diagnosisCopy, ERROR_BOUNDARY, SHELL } from "@/lib/copy";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  diagnosis: Diagnosis;
  retry?: () => void;
  backHref?: string;
  variant?: "inline" | "boundary";
  className?: string;
}

/** Honest diagnosis in human words, last-good data retained by the caller, technical escape hatch below. */
export function ErrorState({ diagnosis, retry, backHref, variant = "inline", className }: ErrorStateProps) {
  const boundary = variant === "boundary";
  const copy = boundary ? ERROR_BOUNDARY : diagnosisCopy(diagnosis.kind);
  const offerRetry = retry && diagnosis.kind !== "not-deployed" ? retry : null;

  return (
    <div
      role="alert"
      className={cn("flex flex-col gap-3 rounded-lg border border-hairline bg-surface-1 p-4", boundary && "p-6", className)}
    >
      <div className="flex flex-col gap-1">
        <p className={cn("text-ink", boundary ? "type-headline" : "type-body-strong")}>{copy.headline}</p>
        <p className="type-body text-ink-secondary">{copy.body}</p>
      </div>
      {(offerRetry || backHref || diagnosis.kind === "fee-token" || diagnosis.kind === "insufficient-collateral") && (
        <div className="flex flex-wrap gap-2">
          {(diagnosis.kind === "fee-token" || diagnosis.kind === "insufficient-collateral") && <Button size="sm" onClick={openFunds}>{SHELL.addMoney}</Button>}
          {offerRetry && (
            <Button variant="secondary" size="sm" onClick={offerRetry}>
              {ERROR_BOUNDARY.retry}
            </Button>
          )}
          {backHref && (
            <Button variant="ghost" size="sm" render={<Link href={backHref} />}>
              {ERROR_BOUNDARY.back}
            </Button>
          )}
        </div>
      )}
      <details className="type-caption text-ink-muted">
        <summary className="cursor-pointer">{ERROR_BOUNDARY.technical}</summary>
        <pre className="numbers mt-2 overflow-x-auto whitespace-pre-wrap text-ink-secondary">
          {diagnosis.kind}
          {diagnosis.errorName ? ` · ${diagnosis.errorName}` : ""}
          {"\n"}
          {diagnosis.technical}
        </pre>
      </details>
    </div>
  );
}
