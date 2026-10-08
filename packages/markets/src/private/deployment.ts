/** Where the PrivateDesk lives on a chain (Masayume 68f7a09:packages/markets/src/private/deployment.ts), from the generated fragments. */
import type { Address } from "viem";
import { deployments } from "@cwf/clients";

type Fragment = { contracts: Record<string, { address: string; deployBlock?: number | null }> };
const byChain = deployments as unknown as Record<string, Record<string, Fragment | undefined>>;

export function privateDeskOf(chainId: number): { chainId: number; privateDesk: Address; fromBlock: bigint } | null {
  const d = byChain[String(chainId)]?.private?.contracts.PrivateDesk;
  return d ? { chainId, privateDesk: d.address as Address, fromBlock: BigInt(d.deployBlock ?? 0) } : null;
}
