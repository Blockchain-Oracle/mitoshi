// Ported from Masayume 68f7a09:packages/markets/src/submitter/journal.ts — records carry the chain, the nonce kind, the
// expiring window (`validBeforeSec`) and sponsorship (plan C.2.1 IntentRecord), and ids come from getRandomValues.
import type { IntentJournal, IntentRecord, IntentState } from "@cwf/core";
import { randomId } from "../random";

export interface JournalRecord extends IntentRecord {
  failureReason?: string;
}

/** Where journal records live: memory (ops, scripts, tests), localStorage (web), MMKV (the app, SM3). */
export interface IntentStore {
  load(): JournalRecord[];
  save(records: JournalRecord[]): void;
}

const MAX_RECORDS = 200;
const UNRESOLVED: ReadonlySet<IntentState> = new Set<IntentState>(["recorded", "sent", "unknown"]);

/** One journal over any store. Intent is recorded before send so a no-receipt timeout is reconciled, never retried (AD-3). */
export function createJournal(store: IntentStore, nowMs: () => number = Date.now): IntentJournal {
  const update = (id: string, patch: Partial<JournalRecord>) => {
    store.save(store.load().map((record) => (record.id === id ? { ...record, ...patch } : record)));
  };

  return {
    async record(entry) {
      const record: JournalRecord = { ...entry, id: randomId(), state: "recorded", createdAtMs: nowMs() };
      store.save([...store.load(), record].slice(-MAX_RECORDS));
      return record;
    },
    async markSent(id, txHash) {
      update(id, { state: "sent", txHash });
    },
    async markConfirmed(id) {
      update(id, { state: "confirmed" });
    },
    async markFailed(id, reason) {
      update(id, { state: "failed", failureReason: reason });
    },
    async markUnknown(id) {
      update(id, { state: "unknown" });
    },
    async listUnresolved(wallet) {
      const owner = wallet.toLowerCase();
      return store.load().filter((record) => record.wallet.toLowerCase() === owner && UNRESOLVED.has(record.state));
    },
  };
}
