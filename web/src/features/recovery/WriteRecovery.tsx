"use client";
// Ported from Masayume 68f7a09:web/src/features/recovery/WriteRecovery.tsx

import { chainReconciler, recoverUnresolved, type RecoveryResult, type SubmitterSession } from "@cwf/markets";
import { useUserSession } from "@cwf/markets/react";
import { useEffect } from "react";
import { notify } from "@/lib/toast";
import { RECOVERY } from "./copy";

/**
 * Asks the chain about every write the journal still holds open — a send that timed out,
 * a tab closed between the passkey prompt and the receipt — once per signing session, and
 * says what it found. Nothing is re-sent (AD-3): a record moves only on the chain's answer.
 *
 * Keyed on the session object rather than the address so React's development double-run
 * cannot announce a record twice, while a fresh session for the same wallet is asked again.
 */
const asked = new WeakSet<SubmitterSession>();

function announce(results: RecoveryResult[]): void {
  let pending = 0;
  for (const { record, outcome, error } of results) {
    if (outcome === "landed") notify.neutral(RECOVERY.landed(record.summary).title, RECOVERY.landed(record.summary).description);
    else if (outcome === "absent") notify.warning(RECOVERY.absent(record.summary).title, RECOVERY.absent(record.summary).description);
    else if (outcome === "reverted") notify.warning(RECOVERY.reverted(record.summary).title, RECOVERY.reverted(record.summary).description);
    else if (outcome === "expired") notify.warning(RECOVERY.expired(record.summary).title, RECOVERY.expired(record.summary).description);
    else if (outcome === "pending") pending += 1;
    else console.warn("[recovery] could not ask the chain about", record.summary, error);
  }
  if (pending > 0) notify.neutral(RECOVERY.pending(pending).title, RECOVERY.pending(pending).description);
}

export function WriteRecovery() {
  const session = useUserSession();

  useEffect(() => {
    if (!session || asked.has(session)) return;
    asked.add(session);
    let cancelled = false;
    recoverUnresolved(session.submitter.journal, session.address, chainReconciler, Date.now())
      .then((results) => {
        if (!cancelled) announce(results);
      })
      .catch((error: unknown) => console.warn("[recovery] journal read failed:", error));
    return () => {
      cancelled = true;
    };
  }, [session]);

  return null;
}
