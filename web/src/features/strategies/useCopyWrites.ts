"use client";
// Ported in role from Agari 03b30ab:web/src/features/strategies/useDeskWrites.ts — one tx lane run per write (the lane
// journals it; an unknown send is decided by its expiring window, never re-sent), then every read the write moved.
/**
 * The desk's writes (S9.7): copy (one self-paid transaction), switch follow ↔ fade (free), stop (sponsored). After a
 * confirmed write: the catalogue, the wallet's consents and its Trading Balance and wallet reads are refreshed.
 */
import { isOk, type Address, type TxIntent, type VaultGrant } from "@cwf/core";
import { invalidateAfterWrite, useBalanceSheet, useVaultSnapshot } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTxLifecycle } from "@/components/tx";
import { useWalletSession } from "@/lib/wallet-session";
import { mineKey, STRATEGIES_KEY, useMyStrategies } from "./useStrategies";

export function useCopyWrites() {
  const session = useWalletSession();
  const wallet = (session.address ?? null) as Address | null;
  const tx = useTxLifecycle();
  const queryClient = useQueryClient();
  const vault = useVaultSnapshot(wallet);
  const sheet = useBalanceSheet(wallet);
  const mine = useMyStrategies(wallet);
  const snapshot = vault && isOk(vault) ? vault.value : null;
  const grant: VaultGrant | null = snapshot?.grants.strategy ?? null;
  const availableBase = !wallet ? 0n : snapshot ? snapshot.account.availableBase : null;
  const walletBase = !wallet ? 0n : sheet && isOk(sheet) ? sheet.value.spendableBase : null;

  const run = useCallback(
    async (intent: TxIntent) => {
      const outcome = await tx.run(intent);
      if (outcome?.status === "confirmed") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: STRATEGIES_KEY }),
          queryClient.invalidateQueries({ queryKey: mineKey(wallet) }),
          wallet ? invalidateAfterWrite(queryClient, { wallet }) : Promise.resolve(),
        ]);
      }
      return outcome;
    },
    [tx, queryClient, wallet],
  );

  return {
    wallet,
    signedIn: wallet !== null,
    signer: session.kind === "injected" ? ("injected" as const) : ("passkey" as const),
    connect: session.connect,
    tx,
    run,
    grant,
    availableBase,
    walletBase,
    mine: mine.data?.subscriptions ?? [],
    myFills: mine.data?.fills ?? [],
    mineReady: !wallet || mine.isSuccess,
  };
}

export type CopyWrites = ReturnType<typeof useCopyWrites>;
