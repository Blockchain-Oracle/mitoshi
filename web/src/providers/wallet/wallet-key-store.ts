/**
 * What this device knows about its wallet-mode key (D-047): the accounts SDK keeps the key itself (non-extractable, in
 * its own store); this remembers the terms it was armed with, per account and chain, so the ticket can say "no prompt"
 * before the first call publishes the key on chain, and `/settings/account` can show a key that is armed here but not
 * yet live. The chain stays the truth for everything it has seen (`/api/keys`). Best-effort storage: a private window
 * simply forgets, and the next tap asks for the passkey instead of silently failing.
 */
import type { Address } from "@cwf/core";

export interface WalletKeyState {
  /** The access key's address (its key id on the AccountKeychain). */
  keyId: Address;
  expirySec: number;
  /** The daily limit it counts new approvals against, in pathUSD base units. */
  limitBase: bigint;
  armedAtMs: number;
}

const PREFIX = "cwf.walletKey.v1";
/** Raised on this page when the record changes (armed, forgotten), so every reader updates at once. */
export const WALLET_KEY_EVENT = "cwf:wallet-key";
const changed = () => {
  try {
    window.dispatchEvent(new Event(WALLET_KEY_EVENT));
  } catch {
    // no window
  }
};
const keyOf = (chainId: number, account: Address) => `${PREFIX}.${chainId}.${account.toLowerCase()}`;

export function readWalletKey(chainId: number, account: Address, nowSec: number = Math.floor(Date.now() / 1000)): WalletKeyState | null {
  try {
    const raw = window.localStorage.getItem(keyOf(chainId, account));
    if (!raw) return null;
    const v = JSON.parse(raw) as { keyId: Address; expirySec: number; limitBase: string; armedAtMs: number };
    if (!v.keyId || !(v.expirySec > nowSec)) return null;
    return { keyId: v.keyId, expirySec: v.expirySec, limitBase: BigInt(v.limitBase), armedAtMs: v.armedAtMs };
  } catch {
    return null;
  }
}

export function writeWalletKey(chainId: number, account: Address, state: WalletKeyState): void {
  try {
    window.localStorage.setItem(keyOf(chainId, account), JSON.stringify({ ...state, limitBase: state.limitBase.toString() }));
  } catch {
    // storage unavailable: the key still works for this session
  }
  changed();
}

export function forgetWalletKey(chainId: number, account: Address): void {
  try {
    window.localStorage.removeItem(keyOf(chainId, account));
  } catch {
    // nothing to forget
  }
  changed();
}
