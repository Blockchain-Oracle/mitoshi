import "server-only";
// The Memory Market's server side (S9.9, L-56; Agari 03b30ab `app/api/strategies/memory/*` routes' checks): the chain
// answers who the creator is and whether a reader holds a live subscription — head-fresh, never the index — and an
// unreadable chain opens nothing.
import type { Address } from "viem";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { CHAIN } from "@cwf/clients";
import { strategyVenueOf } from "@cwf/markets/strategies";
import { chainClient } from "@/server/faucet";
import { serverEnv } from "@/server/env";

export async function memoryFacts(strategyId: bigint, reader: Address): Promise<{ creator: Address; feeBase: bigint; subscribed: boolean } | null> {
  const venue = strategyVenueOf(serverEnv().network === "mainnet" ? CHAIN.tempo : CHAIN.moderato);
  if (!venue) return null;
  const registry = { address: venue.strategyRegistry, abi: strategyRegistryAbi } as const;
  const client = chainClient();
  const count = (await client.readContract({ ...registry, functionName: "strategyCount" })) as bigint;
  if (strategyId < 1n || strategyId > count) return null;
  const [s, sub] = (await client.multicall({
    allowFailure: false,
    contracts: [
      { ...registry, functionName: "strategyOf", args: [strategyId] },
      { ...registry, functionName: "subscriptionOf", args: [strategyId, reader] },
    ],
  })) as [{ creator: Address; subscriptionFee: bigint }, { active: boolean }];
  return { creator: s.creator, feeBase: s.subscriptionFee, subscribed: sub.active };
}
