/**
 * The precompile's word on each key right now: revoked, expiry, and per token what may still be spent this period and
 * when the period ends (`getRemainingLimitWithPeriod`). One multicall per refresh.
 */
import type { Address, PublicClient } from "viem";
import { Abis } from "viem/tempo";
import { TEMPO } from "@cwf/clients";
import type { KeyHistory } from "./fold";

export { keyStatus, type KeyStatus } from "./status";

export interface KeyTokenState {
  token: Address;
  limit: bigint | null;
  period: bigint | null;
  remaining: bigint | null;
  periodEndSec: bigint | null;
}

export interface KeyState extends Omit<KeyHistory, "tokens"> {
  /** From `getKey`; null when the read failed (never guessed). */
  live: { revoked: boolean; expirySec: bigint; enforceLimits: boolean } | null;
  tokens: KeyTokenState[];
}


export async function readKeyStates(client: PublicClient, account: Address, keys: readonly KeyHistory[]): Promise<KeyState[]> {
  const address = TEMPO.accountKeychain as Address;
  const abi = Abis.accountKeychain;
  const keyCalls = keys.map((k) => ({ address, abi, functionName: "getKey" as const, args: [account, k.keyId] as const }));
  const limitCalls = keys.flatMap((k) => k.tokens.map((t) => ({ address, abi, functionName: "getRemainingLimitWithPeriod" as const, args: [account, k.keyId, t.token] as const })));
  const [keyRes, limitRes] = await Promise.all([
    keyCalls.length ? client.multicall({ contracts: keyCalls, allowFailure: true }) : [],
    limitCalls.length ? client.multicall({ contracts: limitCalls, allowFailure: true }) : [],
  ]);
  let li = 0;
  return keys.map((k, i) => {
    const r = keyRes[i] as { status: string; result?: { "expiry": bigint; enforceLimits: boolean; isRevoked: boolean } /* the precompile's own field name */ } | undefined;
    const live = r?.status === "success" && r.result ? { revoked: r.result.isRevoked, expirySec: r.result.expiry, enforceLimits: r.result.enforceLimits } : null;
    const tokens = k.tokens.map((t) => {
      const lr = limitRes[li++] as { status: string; result?: readonly [bigint, bigint] } | undefined;
      const ok = lr?.status === "success" && lr.result;
      return { token: t.token, limit: t.limit, period: t.period ?? null, remaining: ok ? lr.result![0] : null, periodEndSec: ok ? lr.result![1] : null };
    });
    return { ...k, live, tokens };
  });
}

/**
 * What one key may still spend of `token` this period, and when the period ends (S23c: the terminal caps a one-tap
 * stake by it, so a tap over the key's daily limit is named before signing instead of refused by the chain).
 */
export async function readKeyRemaining(client: PublicClient, account: Address, keyId: Address, token: Address = TEMPO.pathUSD as Address): Promise<{ remaining: bigint; periodEndSec: bigint }> {
  const [remaining, periodEndSec] = (await client.readContract({ address: TEMPO.accountKeychain as Address, abi: Abis.accountKeychain, functionName: "getRemainingLimitWithPeriod", args: [account, keyId, token] })) as readonly [bigint, bigint];
  return { remaining, periodEndSec };
}
