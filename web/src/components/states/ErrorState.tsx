"use client";
// Ported from Masayume 68f7a09:web/src/components/states/ErrorState.tsx. R6 (D-230, T16 + T20) revamped From 21st.dev
// 19376 olewandowski1/empty-states-4 (the error empty state: an accent tile, a title, one line, retry and a second way)
// in EmptyState's frame: the destructive tile becomes `text-warning` (degraded truth is never red for a read), sonner
// goes (our `notify` answers events elsewhere), remixicon becomes lucide. Every current caller is a read, so the read
// voice is the default ("Prices are busy. Retrying." — never "Nothing was sent" on a page load); a write passes
// `mode="write"`. The fix comes from the diagnosis (`fixForDiagnosis`), never a hard-coded string; no retry for a
// contract that isn't deployed (no retry can deploy it — Owarine guards the same).
import type { Diagnosis } from "@cwf/core";
import { diagnosisCopy, ERROR_BOUNDARY, fixForDiagnosis, fixLabel } from "@cwf/core/copy";
import { RotateCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Pill, PillLink } from "@/components/kit/Pill";
import { useFixRunner } from "./BlockedCta";
import { StateFrame } from "./EmptyState";

export interface ErrorStateProps {
  diagnosis: Diagnosis;
  retry?: () => void;
  backHref?: string;
  /** Default "read": every page-load and poll failure. A failed write passes "write" (it says whether money moved). */
  mode?: "read" | "write";
  /** `inline` (default) in its frame, `boundary` for a screen that threw, `strip` one line for the connection strip. */
  variant?: "inline" | "boundary" | "strip";
  className?: string;
}

/** Honest diagnosis in human words, last-good data retained by the caller, technical escape hatch below. */
export function ErrorState({ diagnosis, retry, backHref, mode = "read", variant = "inline", className }: ErrorStateProps) {
  const boundary = variant === "boundary";
  const copy = boundary ? { headline: ERROR_BOUNDARY.headline, body: ERROR_BOUNDARY.body } : diagnosisCopy(diagnosis.kind, mode);
  const offerRetry = retry && diagnosis.kind !== "not-deployed" ? retry : null;
  const fix = fixForDiagnosis(diagnosis.kind, diagnosis.retryable);
  const run = useFixRunner();
  // Retry is its own pill below; the fix pill is a detour (Add money, Switch, Sign in) the kit can always run.
  const detour = fix && fix.kind !== "retry" && run(fix) ? fix : null;

  return (
    <StateFrame
      role="alert"
      slot="error"
      tone="warning"
      size={variant === "strip" ? "strip" : "panel"}
      icon={<TriangleAlert />}
      title={copy.headline}
      line={copy.body}
      titleClass={boundary ? "type-headline" : undefined}
      className={className}
      actions={detour || offerRetry || backHref ? (
        <>
          {detour ? <Pill tone="accent" size="sm" onClick={() => run(detour)?.()}>{fixLabel(detour)}</Pill> : null}
          {offerRetry ? (
            <Pill tone="ink" size="sm" onClick={offerRetry}>
              {variant === "strip" ? <RotateCw aria-hidden /> : null}
              {ERROR_BOUNDARY.retry}
            </Pill>
          ) : null}
          {backHref ? <PillLink tone="ghost" size="sm" href={backHref}>{ERROR_BOUNDARY.back}</PillLink> : null}
        </>
      ) : null}
    >
      <details className="state-tech type-label-micro">
        <summary>{ERROR_BOUNDARY.technical}</summary>
        <pre className="numbers type-caption-sm normal-case tracking-normal">
          {diagnosis.kind}
          {diagnosis.errorName ? ` · ${diagnosis.errorName}` : ""}
          {"\n"}
          {diagnosis.technical}
        </pre>
      </details>
    </StateFrame>
  );
}
