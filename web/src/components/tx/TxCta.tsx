"use client";

/**
 * The CTA of every write (D-045, D-052): its label IS the blocker while one exists (the accessible name too, Masayume
 * `BlockedButton`), then the lifecycle's own words while it runs — never a bare spinner, every wait named. A tap in a
 * busy state is absorbed. "No fees to pay" sits on the CTA line when the relay covers the call (§2.1.4).
 * `data-primary-action` keeps floating chrome off it (Sensei's seal steps aside; R4-0, D-227).
 */
import type { TxState } from "@cwf/core";
import { canConfirm } from "@cwf/core";
import { Loader2 } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { TX } from "./copy";

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

export interface TxCtaProps {
  state: TxState;
  /** The action's verb phrase, e.g. "Buy UP for $5". */
  action: string;
  signer: SignerKind;
  sponsored?: boolean;
  onConfirm: () => void;
  tone?: "accent" | "up" | "down";
  className?: string;
}

const TONE = {
  accent: "bg-accent-fill text-on-accent hover:bg-accent-fill-pressed",
  up: "bg-profit text-cream-ink",
  down: "bg-loss text-cream-ink",
} as const;

export function TxCta({ state, action, signer, sponsored = false, onConfirm, tone = "accent", className }: TxCtaProps) {
  const reduced = useReducedMotion();
  const label = ctaLabel(state, action, signer);
  const live = canConfirm(state);
  const busy = state.kind === "signing" || state.kind === "submitted" || state.kind === "unknown";
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <m.button
        type="button"
        data-primary-action=""
        onClick={() => live && onConfirm()}
        disabled={!live}
        aria-disabled={!live}
        aria-busy={busy}
        whileTap={live && !reduced ? { scale: 0.97 } : undefined}
        className={cn(
          "inline-flex h-(--ticket-cta-height) w-full items-center justify-center gap-2 rounded-md px-5 type-body-strong transition-colors",
          live ? TONE[tone] : "cursor-not-allowed border border-hairline bg-surface-2 text-ink-secondary",
        )}
      >
        {busy ? <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : null}
        <span>{label}</span>
      </m.button>
      {sponsored && (state.kind === "idle" || state.kind === "review") ? <p className="text-center type-caption text-ink-secondary">{TX.noFees}</p> : null}
    </div>
  );
}
