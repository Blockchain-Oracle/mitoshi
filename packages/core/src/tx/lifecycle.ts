/**
 * The one transaction lifecycle every write renders (D-052; ux-audit §11.1; fidelity list 1–3, 6). Pure: a reducer over
 * events, so every surface — ticket, swap, bridge, follow, launch, revoke — shows the same honest states:
 *
 *   idle → blocked(reason) → review → signing → submitted → confirmed → settled/delivered
 *                                            ↘ failed(diagnosis, moneyMoved)   ↘ unknown (reconciling by validBefore)
 *
 * Tempo confirms in ~0.5 s, so a write may move to an optimistic `confirmed` with `pending: true` the moment it is
 * submitted and roll back to `failed` if the receipt says otherwise. A timed-out send is `unknown` until the chain
 * answers or its expiring window closes; it is never re-sent. A non-urgent revoke waits in `scheduled` for an undo.
 */
import type { Diagnosis, DiagnosisKind } from "../types/diagnosis";
import type { Hex } from "../types/primitives";

/** Whether value moved: the honesty line every failure carries ("Nothing was taken"). */
export type MoneyMoved = "no" | "yes" | "unknown";

export type TxState =
  | { kind: "idle" }
  | { kind: "blocked"; reason: string }
  | { kind: "review" }
  | { kind: "scheduled"; runAtMs: number }
  | { kind: "signing" }
  | { kind: "submitted"; txHash: Hex | null; validBeforeSec: number | null }
  | { kind: "confirmed"; txHash: Hex | null; pending: boolean }
  | { kind: "settled"; txHash: Hex; legs: number; delivered: number }
  | { kind: "failed"; diagnosis: Diagnosis; moneyMoved: MoneyMoved; txHash: Hex | null }
  | { kind: "unknown"; txHash: Hex | null; validBeforeSec: number | null };

export type TxEvent =
  /** The surface re-derived its blocker (null = nothing blocks). */
  | { type: "evaluate"; blocker: string | null }
  | { type: "review" }
  /** Start now, or after an undo window (`undoMs`) for non-urgent revokes. */
  | { type: "confirm"; nowMs: number; undoMs?: number }
  | { type: "undo" }
  | { type: "undo-elapsed" }
  /** The signer produced a signature; `optimistic` moves straight to confirmed-pending (Tempo's ~0.5 s finality). */
  | { type: "submitted"; txHash: Hex | null; validBeforeSec: number | null; optimistic?: boolean }
  | { type: "receipt"; txHash: Hex; status: "success" | "reverted"; diagnosis?: Diagnosis }
  /** A multi-leg flow (bridge) delivered one more leg. */
  | { type: "leg-delivered"; legs: number }
  | { type: "error"; diagnosis: Diagnosis }
  | { type: "timeout"; diagnosis: Diagnosis }
  /** Reconciliation's answer for an `unknown` write. */
  | { type: "reconciled"; verdict: "confirmed" | "reverted" | "absent"; txHash?: Hex }
  /**
   * The lane re-priced before anything was signed (a dearer book, D-208): the tap ends and the surface shows the new
   * price. Not `reset`, which a busy state absorbs — a requote after `confirm` left the buttons busy for good.
   */
  | { type: "requoted" }
  | { type: "reset" };

export const TX_IDLE: TxState = { kind: "idle" };

/** Failures that happen before anything is signed or broadcast: nothing can have moved. */
const PRE_SEND: ReadonlySet<DiagnosisKind> = new Set<DiagnosisKind>([
  "user-rejected", "signer-required", "wrong-chain", "insufficient-collateral", "insufficient-allowance", "fee-token", "not-deployed",
  "region-restricted", "sponsor-refused", "spending-limit", "call-not-allowed", "key-revoked", "market-not-trading", "requote",
  "outside-band", "below-min-quantity", "daily-stop", "grant-refused", "faucet-refused",
]);

/** Whether money moved for a failure: pre-send refusals and reverts move nothing (a Tempo batch is atomic). */
export function moneyMovedFor(diagnosis: Diagnosis, afterSend: boolean): MoneyMoved {
  if (!afterSend || PRE_SEND.has(diagnosis.kind)) return "no";
  if (diagnosis.kind === "send-unknown") return "unknown";
  return "no";
}

const busy = (s: TxState) => s.kind === "signing" || s.kind === "submitted" || s.kind === "unknown" || s.kind === "scheduled";

/** The reducer. Events that make no sense in a state are ignored (a double tap is absorbed, fidelity list 3). */
export function reduceTx(state: TxState, event: TxEvent): TxState {
  switch (event.type) {
    case "evaluate":
      if (busy(state) || state.kind === "confirmed" || state.kind === "settled" || state.kind === "review") return state;
      return event.blocker === null ? (state.kind === "failed" ? state : TX_IDLE) : { kind: "blocked", reason: event.blocker };
    case "review":
      return state.kind === "idle" || state.kind === "failed" ? { kind: "review" } : state;
    case "confirm":
      if (state.kind !== "idle" && state.kind !== "review" && state.kind !== "failed") return state;
      return event.undoMs && event.undoMs > 0 ? { kind: "scheduled", runAtMs: event.nowMs + event.undoMs } : { kind: "signing" };
    case "undo":
      return state.kind === "scheduled" ? TX_IDLE : state;
    case "undo-elapsed":
      return state.kind === "scheduled" ? { kind: "signing" } : state;
    case "submitted":
      if (state.kind !== "signing") return state;
      return event.optimistic ? { kind: "confirmed", txHash: event.txHash, pending: true } : { kind: "submitted", txHash: event.txHash, validBeforeSec: event.validBeforeSec };
    case "receipt":
      if (state.kind !== "submitted" && state.kind !== "unknown" && !(state.kind === "confirmed" && state.pending) && state.kind !== "signing") return state;
      if (event.status === "success") return { kind: "confirmed", txHash: event.txHash, pending: false };
      return { kind: "failed", diagnosis: event.diagnosis ?? { kind: "contract-revert", retryable: false, technical: "reverted on chain", txHash: event.txHash }, moneyMoved: "no", txHash: event.txHash };
    case "leg-delivered":
      if (state.kind === "confirmed" && state.txHash) return { kind: "settled", txHash: state.txHash, legs: event.legs, delivered: 1 };
      if (state.kind === "settled") return { ...state, delivered: Math.min(state.legs, state.delivered + 1) };
      return state;
    case "error": {
      if (!busy(state) && state.kind !== "review" && !(state.kind === "confirmed" && state.pending)) return state;
      const afterSend = state.kind === "submitted" || state.kind === "confirmed";
      const txHash = state.kind === "submitted" || state.kind === "confirmed" ? state.txHash : null;
      return { kind: "failed", diagnosis: event.diagnosis, moneyMoved: moneyMovedFor(event.diagnosis, afterSend), txHash };
    }
    case "timeout": {
      if (state.kind !== "signing" && state.kind !== "submitted" && !(state.kind === "confirmed" && state.pending)) return state;
      const txHash = state.kind === "submitted" || state.kind === "confirmed" ? state.txHash : null;
      const validBeforeSec = state.kind === "submitted" ? state.validBeforeSec : null;
      return { kind: "unknown", txHash, validBeforeSec };
    }
    case "reconciled":
      if (state.kind !== "unknown") return state;
      if (event.verdict === "confirmed") return { kind: "confirmed", txHash: event.txHash ?? state.txHash, pending: false };
      return {
        kind: "failed",
        diagnosis: { kind: event.verdict === "reverted" ? "contract-revert" : "send-unknown", retryable: event.verdict === "absent", technical: `reconciled: ${event.verdict}` },
        moneyMoved: "no",
        txHash: event.txHash ?? state.txHash,
      };
    case "requoted":
      return state.kind === "signing" ? TX_IDLE : state;
    case "reset":
      return busy(state) ? state : TX_IDLE;
  }
}

/** Whether the CTA accepts a tap in this state (every other state absorbs it). */
export function canConfirm(state: TxState): boolean {
  return state.kind === "idle" || state.kind === "review" || state.kind === "failed";
}

/** Confirmation tiers (D-052): a key under its caps taps; a root action asks the passkey; irreversible creation types. */
export type ConfirmTier = "tap" | "passkey" | "typed";

export function confirmTierFor(input: { signer: "access-key" | "session-key" | "passkey" | "injected"; withinCaps: boolean; irreversible: boolean }): ConfirmTier {
  if (input.irreversible) return "typed";
  if ((input.signer === "access-key" || input.signer === "session-key") && input.withinCaps) return "tap";
  return "passkey";
}

/** Revokes, unfollows and cancels that are not time-critical wait this long for an undo (ux-audit §11.1). */
export const UNDO_WINDOW_MS = 5_000;
