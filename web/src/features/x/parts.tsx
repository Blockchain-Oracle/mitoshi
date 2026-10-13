"use client";
// Ported from Owarine 90a91d71:web/src/features/x/{StepSpine,LinkStep,XRelayStatus}.tsx — S11 (D-227): the step on the
// spine, the X mark, and the relay's one line, on Mitoshi's tokens.
import { X_RELAY_STALE_MS } from "@cwf/core";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { RELAY_LINE } from "./copy";
import type { XStatus } from "./protocol";

export type StepState = "idle" | "active" | "done";

/** The X mark (lucide has no X glyph). */
export function XGlyph({ className = "xt-x" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M18.9 1.2h3.7l-8 9.1 9.4 12.5h-7.4l-5.8-7.6-6.6 7.6H.5l8.5-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9Zm-1.3 19.4h2L6.5 3.3H4.4l13.2 17.3Z" />
    </svg>
  );
}

export function Step({ n, title, state, past, children }: { n: number; title: string; state: StepState; past: boolean; children?: ReactNode }) {
  return (
    <li className="xt-step" data-state={state} data-past={past ? "" : undefined}>
      <span className="xt-node" aria-hidden>{state === "done" ? <Check /> : n}</span>
      <div className="xt-body">
        <span className="xt-step-title">{title}</span>
        {state === "idle" ? null : children}
      </div>
    </li>
  );
}

/** Reading mentions, or why not — the relay's own word, never a guess. */
export function RelayLine({ relay, nowMs }: { relay: XStatus["relay"]; nowMs: number }) {
  const key: keyof typeof RELAY_LINE = !relay || !relay.running ? "stopped"
    : relay.updatedAtMs && nowMs - relay.updatedAtMs > X_RELAY_STALE_MS ? "stale"
    : relay.reading.ok ? "ok"
    : relay.reading.block ?? "error";
  return (
    <p className="xt-relay" data-ok={key === "ok" ? "" : undefined} data-paused={key !== "ok" && key !== "stopped" ? "" : undefined} role="status">
      <span aria-hidden className="xt-relay-dot" />
      {RELAY_LINE[key]}
      {relay?.running && relay.dryRun && key === "ok" ? " · dry run" : null}
    </p>
  );
}
