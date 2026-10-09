"use client";
/**
 * `/api/activity` for the signed-in account (RV-81): its money moves, newest first. While the server is still reading
 * older blocks (a first visit), it polls; each answer shows as it arrives.
 */
import type { Address, Hex } from "@cwf/core";
import type { ActivityKind, ActivityRow } from "@cwf/markets";
import { useQuery } from "@tanstack/react-query";

export interface ActivityAnswer {
  rows: ActivityRow[];
  coverage: { complete: boolean; fromTimeSec: bigint | null };
}

type Raw = { rows: { txHash: Hex; blockNumber: string; atSec: string | null; kind: ActivityKind; amountBase: string; counterparty: Address | null; feeBase: string }[]; coverage: { complete: boolean; fromTimeSec: string | null } };

export function parseActivity(raw: Raw): ActivityAnswer {
  return {
    rows: raw.rows.map((r) => ({ ...r, blockNumber: BigInt(r.blockNumber), atSec: r.atSec === null ? null : BigInt(r.atSec), amountBase: BigInt(r.amountBase), feeBase: BigInt(r.feeBase) })),
    coverage: { complete: raw.coverage.complete === true, fromTimeSec: raw.coverage.fromTimeSec === null ? null : BigInt(raw.coverage.fromTimeSec) },
  };
}

export function useActivity(account: Address | null, enabled: boolean) {
  return useQuery({
    queryKey: ["cwf", "terminal", "activity", account?.toLowerCase() ?? null],
    enabled: enabled && account !== null,
    queryFn: async () => {
      const response = await fetch(`/api/activity?account=${account}`);
      if (!response.ok) throw new Error(`activity ${response.status}`);
      return parseActivity((await response.json()) as Raw);
    },
    refetchInterval: (q) => (q.state.data && !q.state.data.coverage.complete ? 1_500 : false),
    staleTime: 15_000,
  });
}
