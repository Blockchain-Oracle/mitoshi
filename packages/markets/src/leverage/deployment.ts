/** Where the LeverageReserve lives on a chain (Masayume 68f7a09:packages/markets/src/leverage/deployment.ts), from the generated fragments. */
import type { Address } from "viem";
import { deployments } from "@cwf/clients";

type Fragment = { contracts: Record<string, { address: string; deployBlock?: number | null }> };
const byChain = deployments as unknown as Record<string, Record<string, Fragment | undefined>>;

export interface LeverageVenue {
  chainId: number;
  leverageReserve: Address;
  fromBlock: bigint;
  guard: Address | null;
}

export function leverageVenueOf(chainId: number): LeverageVenue | null {
  const areas = byChain[String(chainId)];
  const r = areas?.leverage?.contracts.LeverageReserve;
  return r ? { chainId, leverageReserve: r.address as Address, fromBlock: BigInt(r.deployBlock ?? 0), guard: (areas?.fair?.contracts.FairValueGuard?.address as Address | undefined) ?? null } : null;
}
