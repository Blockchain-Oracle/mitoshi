/**
 * A browser-held session key (plan C.2.4 `sessions/session-key.ts`; AD-5 SESSION grant, D-003).
 *
 * Rebuilt for Tempo: the key is a WebCrypto P-256 pair created **non-extractable**, so its private half never leaves
 * the browser's key store (IndexedDB holds the CryptoKey handle, not the bytes). It signs taps under a grant the owner
 * made; it can never withdraw, because the vault pays only the owner. The gas top-up is deleted: Tempo has no gas
 * token, and the relay pays the key's fees under the vault policy.
 */
import { Account, WebCryptoP256 } from "viem/tempo";
import type { Address } from "@cwf/core";

export type SessionKeyPair = Awaited<ReturnType<typeof WebCryptoP256.createKeyPair>>;

export interface SessionKeyRecord {
  owner: Address;
  address: Address;
  keyPair: SessionKeyPair;
  createdAtMs: number;
}

/** A fresh non-extractable P-256 key for `owner`. */
export async function generateSessionKey(owner: Address, nowMs: number = Date.now()): Promise<SessionKeyRecord> {
  const keyPair = await WebCryptoP256.createKeyPair({ extractable: false });
  const account = Account.fromWebCryptoP256(keyPair);
  return { owner, address: account.address as Address, keyPair, createdAtMs: nowMs };
}

/** The key as a Tempo account (P-256 envelope signatures, prehashed). */
export function sessionKeyAccount(record: Pick<SessionKeyRecord, "keyPair">) {
  return Account.fromWebCryptoP256(record.keyPair);
}

/** The same key used as a TIP-1011 access key of `root` (wallet mode, D-047): signs as `root` within its limits. */
export function accessKeyAccount(record: Pick<SessionKeyRecord, "keyPair">, root: Address) {
  return Account.fromWebCryptoP256(record.keyPair, { access: root });
}

// ------------------------------------------------------------------ this browser's store (IndexedDB)
// One key per (chain, owner), kept as a CryptoKey handle: it survives reloads and a killed tab, and clearing site data
// deletes it — by design (the grant is then revoked or re-keyed from `/settings/account`). Structured clone keeps the
// non-extractable private key usable without its bytes ever being readable (WebCrypto).

const DB_NAME = "cwf-session-keys";
const STORE = "keys";

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is unavailable in this browser"));
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openStore();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = act(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
  } finally {
    db.close();
  }
}

const storeKey = (chainId: number, owner: Address) => `${chainId}.${owner.toLowerCase()}`;

/** This browser's session key for `owner` on `chainId`, or null (none, another browser, cleared, or no IndexedDB). */
export async function loadSessionKey(chainId: number, owner: Address): Promise<SessionKeyRecord | null> {
  try {
    const found = await withStore<SessionKeyRecord | undefined>("readonly", (s) => s.get(storeKey(chainId, owner)));
    return found && found.owner.toLowerCase() === owner.toLowerCase() ? found : null;
  } catch {
    return null;
  }
}

/** Keeps the key; false when this browser cannot (private mode without IndexedDB) — the arm then refuses honestly. */
export async function saveSessionKey(chainId: number, record: SessionKeyRecord): Promise<boolean> {
  try {
    await withStore("readwrite", (s) => s.put(record, storeKey(chainId, record.owner)));
    return true;
  } catch {
    return false;
  }
}

export async function forgetSessionKey(chainId: number, owner: Address): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(storeKey(chainId, owner)));
  } catch {
    // nothing to forget where storage never worked
  }
}
