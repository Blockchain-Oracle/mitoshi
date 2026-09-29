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
