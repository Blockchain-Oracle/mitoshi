// Ported from Masayume 68f7a09:packages/markets/src/submitter/recovery.ts
import type { Address, IntentJournal, IntentRecord } from "@cwf/core";
import type { ReconcileVerdict } from "./reconcile";

/**
 * Recovery of writes the journal still holds open — a send that timed out, a tab closed between the passkey prompt
 * and the receipt. Run once when a session opens. AD-3, kept strictly: nothing here re-sends. A record moves only on
 * the chain's answer (confirmed, reverted, absent), or when it has waited so long that no answer can be expected.
 */
export const UNVERIFIABLE_AFTER_MS = 24 * 60 * 60 * 1000;

export const RECOVERY_REASON = {
  absent: "reconciled: not on chain",
  reverted: "reconciled: reverted on chain",
  expired: "reconciled: unverifiable after 24h",
} as const;

export type RecoveryOutcome = "landed" | "reverted" | "absent" | "expired" | "pending" | "error";

export interface RecoveryResult {
  record: IntentRecord;
  outcome: RecoveryOutcome;
  error?: unknown;
}

export type Reconciler = (wallet: Address, record: IntentRecord) => Promise<ReconcileVerdict>;

async function recoverOne(journal: IntentJournal, wallet: Address, record: IntentRecord, reconcile: Reconciler, nowMs: number): Promise<RecoveryResult> {
  let verdict: ReconcileVerdict;
  try {
    verdict = await reconcile(wallet, record);
  } catch (error) {
    return { record, outcome: "error", error };
  }
  if (verdict === "confirmed") {
    await journal.markConfirmed(record.id);
    return { record, outcome: "landed" };
  }
  if (verdict === "reverted") {
    await journal.markFailed(record.id, RECOVERY_REASON.reverted);
    return { record, outcome: "reverted" };
  }
  if (verdict === "absent") {
    await journal.markFailed(record.id, RECOVERY_REASON.absent);
    return { record, outcome: "absent" };
  }
  if (nowMs - record.createdAtMs > UNVERIFIABLE_AFTER_MS) {
    await journal.markFailed(record.id, RECOVERY_REASON.expired);
    return { record, outcome: "expired" };
  }
  return { record, outcome: "pending" };
}

/** Every unresolved record of the wallet, each asked about in turn; a reconcile that throws leaves its record untouched. */
export async function recoverUnresolved(journal: IntentJournal, wallet: Address, reconcile: Reconciler, nowMs: number): Promise<RecoveryResult[]> {
  const records = await journal.listUnresolved(wallet);
  const results: RecoveryResult[] = [];
  for (const record of records) results.push(await recoverOne(journal, wallet, record, reconcile, nowMs));
  return results;
}
