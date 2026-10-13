"use client";
/**
 * `/api/keys` for the signed-in account: the chain's keys with live limits. While the server is still scanning older
 * blocks (first visit), it polls; each answer is shown as it arrives so keys appear without waiting for the full scan.
 */
import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "@cwf/core";
import type { KeyState } from "@cwf/markets";
import { keyStatus } from "@cwf/markets/key-status";

export interface KeysAnswer {
  keys: KeyState[];
  coverage: { fromBlock: bigint; toBlock: bigint; complete: boolean; fromTimeSec: bigint | null };
}

const big = (v: string | null | undefined) => (v === null || v === undefined ? null : BigInt(v));
type Raw = { keys: (Omit<KeyState, "expiry" | "authorized" | "revoked" | "lastUsed" | "uses" | "live" | "tokens"> & Record<string, unknown>)[]; coverage: Record<string, string | boolean | null> };
const at = (v: unknown) => (v ? { block: BigInt((v as { block: string }).block), txHash: (v as { txHash: Hex }).txHash } : null);

export function parseKeys(raw: Raw): KeysAnswer {
  return {
    keys: raw.keys.map((k) => {
      const live = k.live as { revoked: boolean; expirySec: string; enforceLimits: boolean } | null;
      const tokens = (k.tokens as { token: Address; limit: string | null; period: string | null; remaining: string | null; periodEndSec: string | null }[]).map((t) => ({
        token: t.token, limit: big(t.limit), period: big(t.period), remaining: big(t.remaining), periodEndSec: big(t.periodEndSec),
      }));
      return {
        keyId: k.keyId, admin: k.admin, signatureType: k.signatureType, expirySec: big(k.expiry as string | null),
        authorized: at(k.authorized), revoked: at(k.revoked), lastUsed: at(k.lastUsed),
        uses: ((k.uses as { block: string; txHash: Hex; token: Address | null; amount: string | null }[] | undefined) ?? []).map((u) => ({ block: BigInt(u.block), txHash: u.txHash, token: u.token, amount: big(u.amount) })),
        live: live ? { revoked: live.revoked, expirySec: BigInt(live.expirySec), enforceLimits: live.enforceLimits } : null, tokens,
      };
    }),
    coverage: {
      fromBlock: BigInt(raw.coverage.fromBlock as string), toBlock: BigInt(raw.coverage.toBlock as string), complete: raw.coverage.complete === true,
      fromTimeSec: big(raw.coverage.fromTimeSec as string | null),
    },
  };
}

export const keysQueryKey = (account: Address | null) => ["account-keys", account?.toLowerCase() ?? null] as const;

export function useKeys(account: Address | null) {
  return useQuery({
    queryKey: keysQueryKey(account),
    enabled: account !== null,
    queryFn: async () => {
      const response = await fetch(`/api/keys?account=${account}`);
      if (!response.ok) throw new Error(`keys ${response.status}`);
      return parseKeys((await response.json()) as Raw);
    },
    refetchInterval: (q) => (q.state.data && !q.state.data.coverage.complete ? 1_000 : false),
    staleTime: 15_000,
  });
}

/** The active keys the chain knows for this account (the settings row's count); null until the first answer. */
export function useActiveKeys(account: Address | null): KeyState[] | null {
  const q = useKeys(account);
  if (!q.data) return null;
  const nowSec = BigInt(Math.floor(Date.now() / 1_000));
  return q.data.keys.filter((k) => keyStatus(k, nowSec) === "active");
}

export function useKeyCounts(account: Address | null): number | null {
  return useActiveKeys(account)?.length ?? null;
}
