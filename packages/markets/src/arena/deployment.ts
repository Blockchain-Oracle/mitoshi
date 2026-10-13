/** Where the GameArena lives on a chain (R4-9, D-227; Masayume 68f7a09:packages/markets/src/games/deployment.ts), from the generated fragments. */
import type { ArenaDeployment } from "@cwf/core/games";
import { deployments } from "@cwf/clients";
import type { Address } from "@cwf/core";

type Fragment = { contracts: Record<string, { address: string; deployBlock?: number | null }> };
const byChain = deployments as unknown as Record<string, Record<string, Fragment | undefined>>;

export function arenaOf(chainId: number): ArenaDeployment | null {
  const d = byChain[String(chainId)]?.arena?.contracts.GameArena;
  return d ? { chainId, gameArena: d.address as Address, fromBlock: BigInt(d.deployBlock ?? 0) } : null;
}

/** The season's prize pool beside the arena in the `arena` fragment; null until the operator deploys one. */
export function seasonPoolOf(chainId: number): Address | null {
  const d = byChain[String(chainId)]?.arena?.contracts.SeasonPrizePool;
  return d ? (d.address as Address) : null;
}
