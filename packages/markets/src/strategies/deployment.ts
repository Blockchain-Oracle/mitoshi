/**
 * Where the StrategyRegistry lives on a chain (Masayume 68f7a09:packages/markets/src/strategies/deployment.ts): the
 * generated `@cwf/clients` fragment is the source of truth (AD-10 lockstep), with the vault it was bound to at birth.
 */
import { getAddress, type Address } from "viem";
import { deployments } from "@cwf/clients";
import type { RegistryDeployment } from "@cwf/core";

type Fragment = { contracts: Record<string, { address: string; deployBlock?: number | null }>; params?: Record<string, unknown> };
const byChain = deployments as unknown as Record<string, Record<string, Fragment | undefined>>;

export interface StrategyVenue extends RegistryDeployment {
  /** The Trading Balance the registry reads grants from (immutable; D-218.1). */
  vault: Address;
  maxMetadataBytes: number;
}

/** The registry on `chainId`, or null when it is not deployed there. */
export function strategyVenueOf(chainId: number): StrategyVenue | null {
  const f = byChain[String(chainId)]?.strategies;
  const r = f?.contracts.StrategyRegistry;
  const vault = f?.params?.vault;
  if (!r || typeof vault !== "string") return null;
  return {
    chainId,
    strategyRegistry: getAddress(r.address),
    fromBlock: BigInt(r.deployBlock ?? 0),
    vault: getAddress(vault),
    maxMetadataBytes: typeof f?.params?.maxMetadataBytes === "number" ? f.params.maxMetadataBytes : 8_192,
  };
}
