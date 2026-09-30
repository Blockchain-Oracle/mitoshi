/**
 * Where the ParlayReserve and the PD-2 guard it reads live on a chain (Masayume 68f7a09:packages/markets/src/parlay/
 * deployment.ts): the generated `@cwf/clients` fragments are the source of truth (AD-10 lockstep), so a redeploy is a
 * `pnpm codegen` away and never an env override in production.
 */
import type { Address } from "viem";
import { deployments } from "@cwf/clients";
import type { ParlayDeployment } from "@cwf/core";

type Fragment = { contracts: Record<string, { address: string; deployBlock?: number | null }> };
const byChain = deployments as unknown as Record<string, Record<string, Fragment | undefined>>;

export interface ParlayVenue extends ParlayDeployment {
  guard: Address;
}

/** The reserve (and its guard) on `chainId`, or null when the reserve is not deployed there. */
export function parlayVenueOf(chainId: number): ParlayVenue | null {
  const areas = byChain[String(chainId)];
  const reserve = areas?.parlay?.contracts.ParlayReserve;
  const guard = areas?.fair?.contracts.FairValueGuard;
  if (!reserve || !guard) return null;
  return { chainId, parlayReserve: reserve.address as Address, fromBlock: BigInt(reserve.deployBlock ?? 0), guard: guard.address as Address };
}
