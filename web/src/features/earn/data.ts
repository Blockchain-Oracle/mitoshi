"use client";
/**
 * `/earn`'s reads (Owarine 90a91d71 `useMakerVault` / `useMakerWindows` / `useMakerShares` / the reserve hooks, on the
 * Tempo port): the maker vault's sheet and Windows, each house reserve's sheet under the key its own feature already
 * polls (so the Range, Parlay and Boost pages and this one share a cache), a supplier's shares per reserve, and the
 * supply ledger — the lifetime counters folded from the reserve's events, read rarely and refreshed after a write.
 * Only the showing tab's reads are enabled; the others sit on whatever the cache holds and poll nothing.
 */
import { MARKETS_POLL_MS } from "@cwf/core/constants";
import type { Address, LeverageReserveState, ParlayReserveState, Reading, ReserveKind } from "@cwf/core";
import type { RangeReserveState } from "@cwf/core/range";
import type { MakerVaultState } from "@cwf/core/maker";
import { getLeverageReserveState } from "@cwf/markets/leverage";
import { getMakerVaultState, getSupplyLedgerOf, listMakerWindows, type MakerWindows, type SupplyLedger } from "@cwf/markets/maker";
import { readParlayReserve } from "@cwf/markets/parlay";
import { getRangeReserveState } from "@cwf/markets/range";
import { useReadingQuery } from "@cwf/markets/react";
import { boostKeys } from "@/features/boost/useBoostWrites";
import { parlayKeys } from "@/features/parlay/data";
import { rangeKeys } from "@/features/range/data";
import { earnKeys } from "./shares";

export { earnKeys, useEarnWorth, useReserveShares, type EarnWorth } from "./shares";

/** A Window the vault settled can't change; a wallet's supply history changes only when it writes. */
const LEDGER_STALE_MS = 5 * 60_000;



/** Every key a write on one reserve can change: this page's, and the reserve's own feature's. */
export const RESERVE_KEYS: Readonly<Record<ReserveKind, readonly string[]>> = { maker: earnKeys.all, range: rangeKeys.all, parlay: parlayKeys.all, boost: boostKeys.all };

export function useMakerVault(enabled = true): Reading<MakerVaultState | null> | null {
  return useReadingQuery(earnKeys.vault(), getMakerVaultState, { pollMs: MARKETS_POLL_MS, enabled });
}

export function useMakerWindows(limit = 10, enabled = true): Reading<MakerWindows> | null {
  return useReadingQuery(earnKeys.windows(limit), () => listMakerWindows(limit), { pollMs: MARKETS_POLL_MS, enabled });
}

export function useRangeReserveFor(enabled: boolean): Reading<RangeReserveState | null> | null {
  return useReadingQuery(rangeKeys.reserve(), getRangeReserveState, { pollMs: MARKETS_POLL_MS, enabled });
}

export function useParlayReserveFor(enabled: boolean): Reading<ParlayReserveState | null> | null {
  return useReadingQuery(parlayKeys.reserve(), readParlayReserve, { pollMs: MARKETS_POLL_MS, enabled });
}

/** The same key the boost ticket and the terminal's settings read the reserve under. */
export function useBoostReserveFor(enabled: boolean): Reading<LeverageReserveState | null> | null {
  return useReadingQuery([...boostKeys.all, "reserve"], getLeverageReserveState, { pollMs: MARKETS_POLL_MS, enabled });
}

/** Everything the wallet supplied to and withdrew from one reserve, from the reserve's own events (A-2c). */
export function useSupplyLedger(kind: ReserveKind, wallet: Address | null): Reading<SupplyLedger | null> | null {
  return useReadingQuery(earnKeys.ledger(kind, wallet), () => getSupplyLedgerOf(kind, wallet!), { enabled: wallet !== null, staleTimeMs: LEDGER_STALE_MS });
}
