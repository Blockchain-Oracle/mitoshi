"use client";

/** The reads the shell needs from day one: the chain clock (boot) and the wallet's balance sheet. */
import type { Address, BalanceSheet, ClockSync, Reading } from "@cwf/core";
import { keys } from "./keys";
import { useMarkets } from "./contexts";
import { useReadingQuery } from "./useReadingQuery";
import { readKeyRemaining } from "../keys/live";
import { getPublicClient } from "../runtime/read-runtime";
import { withReading } from "../runtime/reading";

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

/**
 * What the wallet's one-tap key may still spend today (the AccountKeychain's remaining limit for pathUSD), so the
 * terminal caps a stake before signing (S23c). Keyed under the balance sheet: a write's invalidation refreshes both.
 */
export function useKeyRemaining(wallet: Address | null, keyId: Address | null): Reading<{ remaining: bigint; periodEndSec: bigint }> | null {
  return useReadingQuery(
    keys.keyRemaining(wallet, keyId),
    () => withReading(`keyRemaining:${wallet}:${keyId}`, async () => readKeyRemaining((await getPublicClient()) as never, wallet!, keyId!)),
    { enabled: wallet !== null && keyId !== null, pollMs: BALANCE_POLL_MS },
  );
}
