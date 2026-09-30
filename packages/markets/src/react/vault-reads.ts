"use client";
/**
 * The Trading Balance reads (Masayume 68f7a09:packages/markets/src/react `useVaultSnapshot` / `useVaultHoldings`, on the
 * Tempo port): one keyed query each under `keys.vault(wallet)`, so a vault write's `invalidateAfterWrite` refreshes
 * both, and the balance poll is the fallback for a tab whose stream is down.
 */
import type { Address, MarketId, Reading, VaultHoldings, VaultSnapshot } from "@cwf/core";
import { keys } from "./keys";
import { usePortReading } from "./window-reads";

const VAULT_POLL_MS = 15_000;

/** The account and its live grants; `null` value = no EventVault on this network (never an error). */
export function useVaultSnapshot(wallet: Address | null): Reading<VaultSnapshot | null> | null {
  return usePortReading(keys.vault(wallet), (p) => p.getVaultSnapshot(wallet!), { enabled: wallet !== null, pollMs: VAULT_POLL_MS });
}

/** What the vault holds for `wallet` on one Window (the ticket's "opens a new position?" and the owner's open bets). */
export function useVaultHoldings(wallet: Address | null, marketId: MarketId | null): Reading<VaultHoldings> | null {
  return usePortReading([...keys.vault(wallet), "holdings", marketId], (p) => p.getVaultHoldings(wallet!, { marketId: marketId! } as never), {
    enabled: wallet !== null && marketId !== null,
    pollMs: VAULT_POLL_MS,
  });
}
