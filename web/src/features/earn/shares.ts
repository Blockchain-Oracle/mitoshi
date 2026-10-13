"use client";
/**
 * A supplier's shares in each of the four reserves, and what they add up to (R4-7, D-227) — split from `data.ts` so
 * Portfolio's Earn pocket reads them without the reserves' own feature modules (the boost lane, the range and parlay
 * pages' reads). The keys are /earn's, so the page and the pocket share one cache.
 */
import { MARKETS_POLL_MS } from "@cwf/core/constants";
import type { Address, Reading, ReserveKind } from "@cwf/core";
import { getLeverageSharesOf } from "@cwf/markets/leverage";
import { getMakerSharesOf } from "@cwf/markets/maker";
import { getParlaySharesOf } from "@cwf/markets/parlay";
import { getRangeSharesOf } from "@cwf/markets/range";
import { useReadingQuery } from "@cwf/markets/react";

export const earnKeys = {
  all: ["cwf", "earn"] as const,
  vault: () => ["cwf", "earn", "vault"] as const,
  windows: (limit: number) => ["cwf", "earn", "windows", limit] as const,
  shares: (kind: ReserveKind, wallet: string | null) => ["cwf", "earn", "shares", kind, wallet] as const,
  ledger: (kind: ReserveKind, wallet: string | null) => ["cwf", "earn", "ledger", kind, wallet] as const,
};

const SHARES_OF = {
  maker: getMakerSharesOf,
  range: getRangeSharesOf,
  parlay: getParlaySharesOf,
  boost: getLeverageSharesOf,
} as const satisfies Record<ReserveKind, (wallet: Address) => Promise<Reading<{ shares: bigint; worthBase: bigint }>>>;

/** One wallet's shares in one reserve and their worth today; zeros without a reserve. */
export function useReserveShares(kind: ReserveKind, wallet: Address | null): Reading<{ shares: bigint; worthBase: bigint }> | null {
  return useReadingQuery(earnKeys.shares(kind, wallet), () => SHARES_OF[kind](wallet!), { pollMs: MARKETS_POLL_MS, enabled: wallet !== null });
}

export interface EarnWorth {
  /** What the wallet's shares in all four reserves are worth today (base units). */
  totalBase: bigint;
  byKind: Readonly<Record<ReserveKind, bigint>>;
  /** Where most of it is, for the link back to /earn?r=. */
  largest: ReserveKind;
}

/**
 * Money supplied to the vault and the three reserves, as Portfolio names it beside the figure (FR-5; R4-7, D-227): the
 * four share reads at today's worth, null until every one has answered (never a partial sum), and the largest for the
 * link. A reserve not on this network reads as zero shares, so it adds nothing.
 */
export function useEarnWorth(wallet: Address | null): EarnWorth | null {
  const maker = useReserveShares("maker", wallet);
  const range = useReserveShares("range", wallet);
  const parlay = useReserveShares("parlay", wallet);
  const boost = useReserveShares("boost", wallet);
  const reads = { maker, range, parlay, boost } as const;
  if (Object.values(reads).some((r) => r === null || !r.ok)) return null;
  const byKind = Object.fromEntries(Object.entries(reads).map(([k, r]) => [k, r?.ok ? r.value.worthBase : 0n])) as Record<ReserveKind, bigint>;
  const kinds = Object.keys(byKind) as ReserveKind[];
  const largest = kinds.reduce((best, k) => (byKind[k] > byKind[best] ? k : best), "maker" as ReserveKind);
  return { totalBase: kinds.reduce((sum, k) => sum + byKind[k], 0n), byKind, largest };
}
