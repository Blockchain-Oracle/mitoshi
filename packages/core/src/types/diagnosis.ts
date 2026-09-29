// Ported from Masayume 68f7a09:packages/core/src/types/diagnosis.ts
import { z } from "zod";
import { hexSchema } from "./primitives";

export const DIAGNOSIS_KINDS = [
  "signer-required",
  "wrong-chain",
  "user-rejected",
  /** The fee token (pathUSD) can't cover the fee and no sponsor covered it (Tempo has no gas token). */
  "fee-token",
  "insufficient-collateral",
  "insufficient-allowance",
  "market-not-trading",
  "order-expired",
  "post-only-would-cross",
  "no-liquidity",
  /** The resting book is thinner than this order, or its spread too wide to price. Nothing to do with the reserve's capital. */
  "thin-book",
  /** A funded reserve refusing on its own policy: per-position, per-Window or aggregate caps. A smaller stake fits. */
  "reserve-cap",
  "below-min-quantity",
  "outside-band",
  "daily-stop",
  "invalid-price",
  "requote",
  "not-settled",
  "already-claimed",
  "faucet-refused",
  "grant-refused",
  "not-deployed",
  /** Tempo access-key refusals (TIP-1011): over the key's periodic limit, a call outside its scopes, a revoked key. */
  "spending-limit",
  "call-not-allowed",
  "key-revoked",
  /** The fee relay declined to sponsor this transaction (policy, budget or breaker). */
  "sponsor-refused",
  /** A TIP-403 receive policy holds the transfer (the recipient's policy refuses it). */
  "receive-policy",
  /** The area is browse-only from this region (C.3.5); exits stay open. */
  "region-restricted",
  "indexer-down",
  "rpc-down",
  "contract-revert",
  "send-unknown",
  "unknown",
] as const;

export type DiagnosisKind = (typeof DIAGNOSIS_KINDS)[number];

export const diagnosisSchema = z.object({
  kind: z.enum(DIAGNOSIS_KINDS),
  retryable: z.boolean(),
  technical: z.string(),
  errorName: z.string().optional(),
  txHash: hexSchema.optional(),
});

export type Diagnosis = z.infer<typeof diagnosisSchema>;

const RETRYABLE_KINDS: ReadonlySet<DiagnosisKind> = new Set<DiagnosisKind>([
  "indexer-down",
  "rpc-down",
  "send-unknown",
  "sponsor-refused",
  "user-rejected",
  "post-only-would-cross",
  "unknown",
]);

export function diagnosis(
  kind: DiagnosisKind,
  technical: string,
  extra: Pick<Diagnosis, "errorName" | "txHash"> = {},
): Diagnosis {
  return { kind, retryable: RETRYABLE_KINDS.has(kind), technical, ...extra };
}
