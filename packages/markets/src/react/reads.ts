"use client";

/** The reads the shell needs from day one: the chain clock (boot) and the wallet's balance sheet. */
import type { Address, BalanceSheet, ClockSync, Reading } from "@cwf/core";
import { keys } from "./keys";
import { useMarkets } from "./contexts";
import { useReadingQuery } from "./useReadingQuery";

const CLOCK_RESYNC_MS = 60_000;
const BALANCE_POLL_MS = 15_000;

/** Samples the chain clock once a minute; every phase and countdown reads the corrected clock. */
export function useChainClock(): Reading<ClockSync> | null {
  const markets = useMarkets();
  return useReadingQuery(keys.clock(), () => markets.syncClock(), { pollMs: CLOCK_RESYNC_MS });
}

export function useBalanceSheet(wallet: Address | null): Reading<BalanceSheet> | null {
  const markets = useMarkets();
  return useReadingQuery(keys.balanceSheet(wallet), () => markets.getBalanceSheet(wallet!), { enabled: wallet !== null, pollMs: BALANCE_POLL_MS });
}
