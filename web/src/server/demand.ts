import "server-only";
/**
 * Who a fill counts for (D-215), shared by `/stats` and the leaderboard: the house (its role keys in `HOUSE_TRADERS`
 * and the maker vault) is never demand; Trading Balance vaults, current and previous (D-213), stand in for the owners
 * they executed for; product contracts (Boost, Parlay, Range, the private desk) take for owners the index doesn't
 * record yet. Lower-case, from the generated deployments of the configured network.
 */
import { HOUSE_TRADERS, NETWORKS } from "@cwf/core";
import { deploymentsWithHistory, type Area } from "@cwf/markets";
import { webEnv } from "@/lib/env";

export interface DemandAddresses {
  house: string[];
  vaults: string[];
  products: string[];
}

const VAULTS: readonly [Area, string][] = [["vault", "EventVault"], ["vault2", "EventVaultV2"]];
const PRODUCTS: readonly [Area, string][] = [["leverage", "LeverageReserve"], ["parlay", "ParlayReserve"], ["range", "RangeReserve"], ["private", "PrivateDesk"]];

const addresses = (pairs: readonly [Area, string][], chainId: number) =>
  pairs.flatMap(([area, name]) => deploymentsWithHistory(area, name, chainId).map((d) => d.address.toLowerCase()));

export function demandAddresses(): DemandAddresses {
  const network = webEnv.markets.network;
  const chainId = NETWORKS[network];
  return {
    house: [...HOUSE_TRADERS[network], ...addresses([["maker", "MarketMakerVault"]], chainId)],
    vaults: addresses(VAULTS, chainId),
    products: addresses(PRODUCTS, chainId),
  };
}
