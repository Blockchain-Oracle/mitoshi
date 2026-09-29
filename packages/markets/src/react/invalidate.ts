// Ported from Masayume 68f7a09:packages/markets/src/react/invalidate.ts
import type { Address, MarketId } from "@cwf/core";
import type { QueryClient } from "@tanstack/react-query";
import { keys } from "./keys";

export interface WriteScope {
  wallet: Address;
  marketId?: MarketId;
}

/** After a confirmed write every read it can change is refetched; stream-fed keys need nothing. */
export async function invalidateAfterWrite(queryClient: QueryClient, { wallet, marketId }: WriteScope): Promise<void> {
  const families = [
    keys.balanceSheet(wallet), keys.vault(wallet), keys.positions(wallet), keys.history(wallet), keys.claimables(wallet), keys.keychain(wallet),
    ...(marketId ? [keys.onchain(marketId), keys.market(marketId)] : []),
  ];
  await Promise.all(families.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
