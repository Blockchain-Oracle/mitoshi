/**
 * Where the RangeReserve lives on a chain (Masayume 68f7a09:packages/markets/src/range/deployment.ts): the generated
 * `@cwf/clients` fragments are the source of truth (AD-10 lockstep); no env override in production.
 */
import type { Address } from "viem";
import { deployments } from "@cwf/clients";

type Fragment = { contracts: Record<string, { address: string; deployBlock?: number | null }> };
const byChain = deployments as unknown as Record<string, Record<string, Fragment | undefined>>;

export interface RangeVenue {
  chainId: number;
  rangeReserve: Address;
  fromBlock: bigint;
}

export function rangeVenueOf(chainId: number): RangeVenue | null {
  const r = byChain[String(chainId)]?.range?.contracts.RangeReserve;
  return r ? { chainId, rangeReserve: r.address as Address, fromBlock: BigInt(r.deployBlock ?? 0) } : null;
}
