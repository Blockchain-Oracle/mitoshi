/**
 * Nonce choice for a send (plan C.2.3, X21; L-08 journal semantics):
 * - `expiring`: `nonceKey = maxUint256`, `nonce = 0`, `validBefore` ≤ now + 300 s (taps use 25 s). No receipt after
 *   `validBefore` means "not included", decided by expiry and never re-sent.
 * - `lane`: a 2D nonce key for ordered streams (agents, keeper), `nonce` from the chain.
 * - `protocol`: the account's own sequence (owner sends that must be ordered).
 */
import { maxUint256 } from "viem";
import { EXPIRING_NONCE_MAX_SEC, TAP_VALID_FOR_SEC, type NonceKind } from "@cwf/core";

export type NoncePlan = { kind: "expiring"; validForSec?: number } | { kind: "lane"; key: bigint } | { kind: "protocol" };

export interface NonceFields {
  nonceKey?: bigint;
  nonce?: number;
  validBefore?: number;
}

/** The request fields a plan sets, against the chain-corrected `nowSec`. */
export function nonceFields(plan: NoncePlan, nowSec: number): NonceFields {
  if (plan.kind === "expiring") {
    const validFor = Math.min(plan.validForSec ?? TAP_VALID_FOR_SEC, EXPIRING_NONCE_MAX_SEC);
    return { nonceKey: maxUint256, nonce: 0, validBefore: nowSec + validFor };
  }
  if (plan.kind === "lane") {
    if (plan.key <= 0n || plan.key >= maxUint256) throw new Error("a lane nonce key is in (0, maxUint256)");
    return { nonceKey: plan.key };
  }
  return {};
}

export function nonceKindOf(plan: NoncePlan): NonceKind {
  return plan.kind;
}

/** The journal's `validBeforeSec` for a plan (null unless expiring). */
export function validBeforeOf(fields: NonceFields): number | null {
  return fields.validBefore ?? null;
}
