"use client";

/**
 * The CTA of every write (D-045, D-052), revamped in R6 (D-230, T06 + T12) on the kit PillButton:
 *  - blocked → BlockedCta: a blocker with a fix IS the action ("Add money", "Use $1"); the stated face only where none.
 *  - in flight, it never looks disabled: the side's tone stays at full opacity, a phase bar fills the bottom edge
 *    (1/3 signing · 2/3 sent · 3/3 confirmed) under a soft sweep (From 21st.dev 36528 ibrandify/save-with-progress),
 *    the faces swap in one cell (23536 ddoemonn/loading-button) and Signing · Sent · Confirmed runs underneath
 *    (TxSteps, 23569 ddoemonn/task-steps) — every wait named, a tap absorbed.
 *  - confirmed → it morphs into `receipt` when the host gives one (TxMorph).
 * The caption slot under the pill holds one line in every state, so nothing jumps. CSS only, no motion runtime.
 * `data-primary-action` keeps floating chrome off it (Sensei's seal steps aside; R4-0, D-227).
 */
import type { TxState } from "@cwf/core";
import { canConfirm } from "@cwf/core";
import type { BlockerCopy } from "@cwf/core/copy";
import type { CSSProperties, ReactNode } from "react";
import { Pill } from "@/components/kit/Pill";
import { BlockedCta, type BlockedCtaProps } from "@/components/states/BlockedCta";
import { Faces } from "@/components/states/Faces";
import { useClockValue } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { TX } from "./copy";
import { TxMorph } from "./TxMorph";
import { TxSteps } from "./TxSteps";

export type SignerKind = "passkey" | "access-key" | "session-key" | "injected";

/** The CTA's signer from the session's account kind: a passkey signs as one, anything else is a browser wallet. */
export function signerOfKind(kind: string | null): SignerKind {
  return kind === "passkey" ? "passkey" : "injected";
}

export function signingLabel(signer: SignerKind): string {
  return signer === "passkey" ? TX.signingPasskey : signer === "injected" ? TX.signingWallet : TX.signingKey;
}

export function ctaLabel(state: TxState, action: string, signer: SignerKind): string {
  switch (state.kind) {
    case "blocked":
      return state.reason;
    case "scheduled":
      return TX.scheduled(0);
    case "signing":
      return signingLabel(signer);
    case "submitted":
      return TX.submitted;
    case "unknown":
      return TX.unknown;
    case "confirmed":
      return TX.confirmed;
    case "failed":
      return TX.retry;
    default:
      return action;
  }
}

/** The phase bar's fill: a third per step the write has taken. */
export function txProgress(state: TxState): number {
  switch (state.kind) {
    case "signing":
      return 1 / 3;
    case "submitted":
    case "unknown":
      return 2 / 3;
    case "confirmed":
      return 1;
    default:
      return 0;
  }
}

export interface TxCtaProps {
  state: TxState;
  /** The action's verb phrase, e.g. "Buy UP for $5". */
  action: string;
  signer: SignerKind;
  sponsored?: boolean;
  onConfirm: () => void;
  tone?: "accent" | "up" | "down";
  className?: string;
  /** The blocker's words and fix while `state.kind === "blocked"` (else `{ label: state.reason }` with no fix). */
  blocker?: BlockerCopy;
  onFix?: BlockedCtaProps["onFix"];
  fix?: BlockedCtaProps["fix"];
  /** The sign-in sheet's intent for a sign-in fix. */
  intent?: string;
  /** Signing · Sent · Confirmed in the caption slot while in flight (default true). */
  steps?: boolean;
  /** On confirmed (not pending), the CTA morphs into this. */
  receipt?: ReactNode;
  /** A scheduled write's undo (the caption's ghost link). */
  onUndo?: () => void;
  /** `lg` = the ticket CTA (52 px), `md` = 48 px. */
  size?: "lg" | "md";
}

function ScheduledFace({ runAtMs }: { runAtMs: number }) {
  const sec = useClockValue((now) => (now === 0 ? 0 : Math.max(0, Math.ceil((runAtMs - now) / 1000))));
  return <>{TX.scheduled(sec)}</>;
}

export function TxCta({ state, action, signer, sponsored = false, onConfirm, tone = "accent", className, blocker, onFix, fix, intent, steps = true, receipt, onUndo, size = "lg" }: TxCtaProps) {
  const done = (state.kind === "confirmed" && !state.pending);
  if (state.kind === "blocked") {
    return (
      <BlockedCta
        className={className}
        blocker={blocker ?? { label: state.reason, reason: null, fix: null }}
        tone={tone}
        onFix={onFix}
        fix={fix}
        intent={intent}
        size={size}
        caption={sponsored ? TX.noFees : null}
      />
    );
  }
  const live = canConfirm(state);
  const busy = state.kind === "signing" || state.kind === "submitted" || state.kind === "unknown" || state.kind === "scheduled";
  const pillTone = state.kind === "failed" ? "ink" : tone === "up" ? "up-fill" : tone === "down" ? "down-fill" : "accent";
  const face = state.kind === "scheduled" ? <ScheduledFace runAtMs={state.runAtMs} /> : done && state.kind === "confirmed" ? TX.confirmedDone : ctaLabel(state, action, signer);
  const inFlight = steps && (busy || state.kind === "confirmed") && state.kind !== "scheduled";
  const caption: ReactNode =
    state.kind === "failed" ? TX.moneyMoved[state.moneyMoved]
    : state.kind === "unknown" ? TX.notResent
    : state.kind === "scheduled" ? (onUndo ? <button type="button" className="txcta-undo min-h-touch type-caption" onClick={onUndo}>{TX.undo}</button> : null)
    : inFlight ? <TxSteps state={state} />
    : sponsored && (state.kind === "idle" || state.kind === "review") ? TX.noFees
    : null;
  const cta = (
    <div className={cn("txcta", receipt ? null : className)} data-phase={state.kind}>
      <Pill
        type="button"
        data-primary-action=""
        data-done={done ? "" : undefined}
        data-slow={state.kind === "unknown" ? "" : undefined}
        tone={pillTone}
        size={size}
        block
        className="txcta-pill"
        aria-busy={busy || undefined}
        aria-disabled={!live || undefined}
        style={{ "--tx-progress": txProgress(state) } as CSSProperties}
        onClick={() => live && onConfirm()}
      >
        <Faces faceKey={state.kind === "review" ? "idle" : state.kind}>
          <span className="truncate">{face}</span>
        </Faces>
        <span aria-hidden className="txcta-bar" />
      </Pill>
      <div className="txcta-caption type-caption" aria-live={state.kind === "failed" ? "polite" : undefined}>{caption}</div>
    </div>
  );
  if (receipt === undefined) return cta;
  return (
    <TxMorph className={className} morphed={done} receipt={receipt}>
      {cta}
    </TxMorph>
  );
}
