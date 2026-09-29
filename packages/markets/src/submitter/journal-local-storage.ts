// Ported from Masayume 68f7a09:packages/markets/src/submitter/journal-local-storage.ts
import type { IntentJournal } from "@cwf/core";
import { createJournal, type IntentStore, type JournalRecord } from "./journal";
import { createMemoryStore } from "./journal-memory";

export const INTENT_JOURNAL_KEY = "cwf.intents.v1";

// bigint never survives JSON; any bigint field serializes as a decimal string.
const replacer = (_key: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value);

function isRecord(value: unknown): value is JournalRecord {
  return typeof value === "object" && value !== null && typeof (value as JournalRecord).id === "string";
}

function storageOrNull(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function createLocalStorageStore(storage: Storage, key = INTENT_JOURNAL_KEY): IntentStore {
  return {
    load() {
      try {
        const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
        return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
      } catch {
        return [];
      }
    },
    save(records) {
      try {
        storage.setItem(key, JSON.stringify(records, replacer));
      } catch {
        // quota or privacy mode: journaling degrades silently; the write itself is unaffected
      }
    },
  };
}

/** Browser journal; falls back to memory where storage is unavailable (SSR, privacy mode). */
export function createLocalStorageJournal(nowMs?: () => number): IntentJournal {
  const storage = storageOrNull();
  return createJournal(storage ? createLocalStorageStore(storage) : createMemoryStore(), nowMs);
}
