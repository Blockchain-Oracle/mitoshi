"use client";
/**
 * The Trading Balance reads (Masayume 68f7a09:packages/markets/src/react `useVaultSnapshot` / `useVaultHoldings`, on the
 * Tempo port): one keyed query each under `keys.vault(wallet)`, so a vault write's `invalidateAfterWrite` refreshes
 * both, and the balance poll is the fallback for a tab whose stream is down.
 */
import type { Address, MarketId, Reading, VaultBet, VaultHoldings, VaultSnapshot } from "@cwf/core";
import { getPublicClient } from "../runtime/read-runtime";
import { withReading } from "../runtime/reading";
import { legacyVaultDeploymentsOf, readVaultSnapshot } from "../vault/read";
import { keys } from "./keys";
import { useReadingQuery } from "./useReadingQuery";
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

/** The owner's recent Windows traded through the Trading Balance (newest first), for Portfolio's vault rows. */
export function useVaultBets(wallet: Address | null, enabled = true): Reading<VaultBet[]> | null {
  return usePortReading([...keys.vault(wallet), "bets"], (p) => p.listVaultBets(wallet!), { enabled: enabled && wallet !== null, pollMs: VAULT_POLL_MS });
}

/**
 * Every previous Trading Balance (v1 since v2, S24.2; the first v2 since D-213 redeployed it), newest first: each one's
 * account and live grants, so the owner can withdraw what it still holds and stop an old key. Empty = none on this
 * network.
 */
export function useLegacyVaultSnapshots(wallet: Address | null): Reading<VaultSnapshot[]> | null {
  return useReadingQuery(
    [...keys.vault(wallet), "legacy"],
    () =>
      withReading(`legacyVaults:${wallet?.toLowerCase()}`, async () => {
        const client = await getPublicClient();
        const snaps = await Promise.all(legacyVaultDeploymentsOf(client.chain.id).map((d) => readVaultSnapshot(wallet!, d.eventVault)));
        return snaps.filter((s): s is VaultSnapshot => s !== null);
      }),
    { enabled: wallet !== null, pollMs: VAULT_POLL_MS },
  );
}
