/**
 * Keychain events → one record per key (pure). Live state (revoked, expiry, remaining limit this period) comes from the
 * precompile afterwards (`readKeyStates`); the events supply what the chain can't enumerate: which keys, which tokens
 * carry limits, when each was authorised and last used, and the transactions to link.
 */
import type { Address, Hex } from "viem";
import type { KeychainEvent } from "./events";

export interface KeyTokenLimit {
  token: Address;
  /** The last limit set (SpendingLimitUpdated, else the authorising transaction); null when unknown. */
  limit: bigint | null;
  /** Seconds per limit period (0 = one-time); null when unknown. */
  period?: bigint | null;
}

export interface KeyHistory {
  keyId: Address;
  admin: boolean;
  signatureType: number | null;
  expirySec: bigint | null;
  authorized: { block: bigint; txHash: Hex } | null;
  revoked: { block: bigint; txHash: Hex } | null;
  lastUsed: { block: bigint; txHash: Hex } | null;
  /** "Key used" (D43): its spends, newest first, at most `KEY_USES_KEPT`. */
  uses: KeyUse[];
  tokens: KeyTokenLimit[];
}

export interface KeyUse {
  block: bigint;
  txHash: Hex;
  token: Address | null;
  /** What this spend took, in the token's base units; null when the event carried none. */
  amount: bigint | null;
}

/** Enough to read a key's recent story without the record growing with every tap. */
export const KEY_USES_KEPT = 25;

export function foldKeychain(events: readonly KeychainEvent[]): KeyHistory[] {
  const keys = new Map<string, KeyHistory>();
  const get = (keyId: Address) => {
    const k = keyId.toLowerCase();
    let rec = keys.get(k);
    if (!rec) keys.set(k, (rec = { keyId, admin: false, signatureType: null, expirySec: null, authorized: null, revoked: null, lastUsed: null, uses: [], tokens: [] }));
    return rec;
  };
  const token = (rec: KeyHistory, t: Address) => {
    let entry = rec.tokens.find((x) => x.token.toLowerCase() === t.toLowerCase());
    if (!entry) rec.tokens.push((entry = { token: t, limit: null }));
    return entry;
  };
  for (const e of events) {
    const rec = get(e.keyId);
    const at = { block: e.blockNumber, txHash: e.txHash };
    switch (e.name) {
      case "KeyAuthorized":
        // Re-authorising after a revoke starts a fresh record for the same key id.
        if (rec.revoked) Object.assign(rec, { revoked: null, lastUsed: null, uses: [], tokens: [] });
        Object.assign(rec, { signatureType: e.signatureType, expirySec: e.expirySec, authorized: at });
        break;
      case "AdminKeyAuthorized":
        Object.assign(rec, { admin: true, authorized: at });
        break;
      case "KeyRevoked":
        rec.revoked = at;
        break;
      case "SpendingLimitUpdated":
        if (e.token) token(rec, e.token).limit = e.limit;
        break;
      case "AccessKeySpend":
        if (e.token) token(rec, e.token);
        rec.lastUsed = at;
        rec.uses.unshift({ ...at, token: e.token, amount: e.amount });
        if (rec.uses.length > KEY_USES_KEPT) rec.uses.length = KEY_USES_KEPT;
        break;
    }
  }
  return [...keys.values()].sort((a, b) => Number((b.authorized?.block ?? 0n) - (a.authorized?.block ?? 0n)));
}
