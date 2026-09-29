/**
 * Reconciling a write the journal still holds open (Masayume 68f7a09:packages/markets/src/submitter/reconcile.ts,
 * rebuilt for Tempo; L-08).
 *
 * - With a digest, the receipt decides: success or revert.
 * - An expiring-nonce send (`validBeforeSec`) can never land after its window: once the chain clock passes it, the
 *   area's own evidence (its events for this wallet since the record) decides "confirmed" vs "absent". Without area
 *   evidence it stays "unknown" — we never claim absence we can't prove, and we never re-send (AD-3).
 * - Before the window closes, it is still "unknown".
 */
import type { Address, IntentRecord } from "@cwf/core";
import type { Hex, PublicClient } from "viem";

export type ReconcileVerdict = "confirmed" | "reverted" | "absent" | "unknown";

/** Area evidence for a record with no digest: whether the chain shows its effect since `sinceSec`. */
export type AreaEvidence = (wallet: Address, record: IntentRecord, sinceSec: number) => Promise<"landed" | "absent" | "unknown">;

/** Seconds past `validBefore` we wait for the head to move before trusting absence (one or two blocks). */
export const EXPIRY_GRACE_SEC = 3;

export async function reconcileRecord(input: {
  client: Pick<PublicClient, "getTransactionReceipt">;
  wallet: Address;
  record: IntentRecord;
  chainNowSec: number;
  evidence?: AreaEvidence;
}): Promise<ReconcileVerdict> {
  const { client, record } = input;
  if (record.txHash) {
    const receipt = await client.getTransactionReceipt({ hash: record.txHash as Hex }).catch(() => null);
    if (!receipt) return "unknown";
    return receipt.status === "reverted" ? "reverted" : "confirmed";
  }
  if (record.validBeforeSec === null || input.chainNowSec < record.validBeforeSec + EXPIRY_GRACE_SEC) return "unknown";
  if (!input.evidence) return "unknown";
  const seen = await input.evidence(input.wallet, record, Math.floor(record.createdAtMs / 1000));
  return seen === "landed" ? "confirmed" : seen;
}
