/**
 * A key's initial limits (measured on Moderato: authorising emits `KeyAuthorized` but no `SpendingLimitUpdated`), read
 * from the authorising transaction itself — either an `AccountKeychain.authorizeKey` call among its `calls`, or the
 * transaction's inline `keyAuthorization` (the sign-in ceremony's path).
 */
import { decodeFunctionData, type Address, type Hex, type PublicClient } from "viem";
import { TEMPO } from "@cwf/clients";
import type { KeyHistory } from "./fold";
import { accountKeychainAbi } from "./keychain-abi";

export interface AuthorizedLimit {
  token: Address;
  amount: bigint;
  /** Seconds; 0 = a one-time limit over the key's life. */
  period: bigint;
}

type TxShape = {
  calls?: readonly { to?: Address | null; data?: Hex; input?: Hex }[];
  keyAuthorization?: { address?: Address; limits?: readonly { token: Address; limit: bigint; period?: number | bigint }[] | null } | null;
};

export function limitsInTransaction(tx: TxShape, keyId: Address): AuthorizedLimit[] | null {
  const want = keyId.toLowerCase();
  const inline = tx.keyAuthorization;
  if (inline?.address?.toLowerCase() === want) {
    return (inline.limits ?? []).map((l) => ({ token: l.token, amount: l.limit, period: BigInt(l.period ?? 0) }));
  }
  for (const call of tx.calls ?? []) {
    if (call.to?.toLowerCase() !== (TEMPO.accountKeychain as string).toLowerCase()) continue;
    try {
      const d = decodeFunctionData({ abi: accountKeychainAbi, data: (call.data ?? call.input)! });
      if (d.functionName !== "authorizeKey") continue;
      const args = d.args as readonly unknown[];
      if ((args[0] as string).toLowerCase() !== want) continue;
      if (Array.isArray(args[4])) return (args[4] as { token: Address; amount: bigint }[]).map((l) => ({ token: l.token, amount: l.amount, period: 0n }));
      const config = args[2] as { limits: readonly { token: Address; amount: bigint; period: bigint }[] };
      return config.limits.map((l) => ({ token: l.token, amount: l.amount, period: l.period }));
    } catch {
      continue;
    }
  }
  return null;
}

/** Adds each live key's authorised limits (tokens + amounts + periods) to its history. */
export async function withAuthorizedLimits(client: PublicClient, keys: readonly KeyHistory[]): Promise<KeyHistory[]> {
  return Promise.all(
    keys.map(async (k) => {
      if (!k.authorized || k.revoked) return k;
      const tx = (await client.getTransaction({ hash: k.authorized.txHash }).catch(() => null)) as TxShape | null;
      const limits = tx ? limitsInTransaction(tx, k.keyId) : null;
      if (!limits) return k;
      const tokens = [...k.tokens];
      for (const l of limits) {
        const at = tokens.findIndex((t) => t.token.toLowerCase() === l.token.toLowerCase());
        if (at < 0) tokens.push({ token: l.token, limit: l.amount, period: l.period });
        else tokens[at] = { ...tokens[at]!, limit: tokens[at]!.limit ?? l.amount, period: tokens[at]!.period ?? l.period };
      }
      return { ...k, tokens };
    }),
  );
}
