import "server-only";
/**
 * Backup passkeys (S13 step 10, D-053): a second WebAuthn key the account authorised as a TIP-1049 admin key. A
 * credential signs in as the account it backs up only while the chain still says `isAdminKey(account, keyId)` — a
 * revoked backup stops working at the next read. Answers are kept a minute per key, both ways.
 */
import { TEMPO } from "@cwf/clients";
import { createPgPasskeyBackups, type PasskeyBackupStore } from "@cwf/db";
import { passkeyAddress } from "@cwf/markets/server";
import { parseAbi, type Address } from "viem";
import { db } from "./db";
import { chainClient } from "./faucet";

const TTL_MS = 60_000;
const ADMIN_ABI = parseAbi(["function isAdminKey(address account, address keyId) view returns (bool)"]);
const cache = new Map<string, { account: Address | null; atMs: number }>();
let store: PasskeyBackupStore | null = null;
export const backups = (): PasskeyBackupStore => (store ??= createPgPasskeyBackups(db()));

export async function isAdminKey(account: Address, keyId: Address): Promise<boolean> {
  return (await chainClient().readContract({ address: TEMPO.accountKeychain as Address, abi: ADMIN_ABI, functionName: "isAdminKey", args: [account, keyId] })) === true;
}

/** The account a passkey backs up, or null for an account's own passkey (and on any failed read: never guessed). */
export async function backupAccount(publicKeyHex: string): Promise<Address | null> {
  const keyId = passkeyAddress(publicKeyHex);
  const hit = cache.get(keyId);
  if (hit && Date.now() - hit.atMs < TTL_MS) return hit.account;
  let account: Address | null = null;
  try {
    const owner = (await backups().accountOfKey(keyId)) as Address | null;
    account = owner && (await isAdminKey(owner, keyId)) ? owner : null;
  } catch {
    return null;
  }
  cache.set(keyId, { account, atMs: Date.now() });
  if (cache.size > 10_000) cache.clear();
  return account;
}

export const forgetBackup = (publicKeyHex: string) => cache.delete(passkeyAddress(publicKeyHex));
