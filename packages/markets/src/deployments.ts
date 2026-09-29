/**
 * Which areas are deployed on which chain (plan C.1.6 fragments → `@cwf/clients` generated `deployments`). The provider
 * answers a typed "not deployed" reading for an area with no fragment, never a guess and never a mock (D-061 honesty).
 */
import { deployments as generated } from "@cwf/clients";
import { diagnosis, err, type Address, type Reading } from "@cwf/core";

/** The areas the app reads or writes. Each contract stage adds its fragment; `noop` is the relay's S1 proof area. */
export const AREAS = ["engine", "vault", "parlay", "range", "maker", "leverage", "private", "arena", "strategies", "stocks", "themes", "launch", "bridge", "agents"] as const;
export type Area = (typeof AREAS)[number];

export interface DeployedContract {
  address: Address;
  deployBlock: number | null;
}

export type AreaDeployment = Readonly<Record<string, DeployedContract>>;

type Generated = Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, { address: string; deployBlock?: number | null }>>>>>>;

/** The deployment of one area on one chain, or null when no fragment exists for it. */
export function deploymentOf(area: Area, chainId: number, source: Generated = generated as Generated): AreaDeployment | null {
  const byArea = source[String(chainId)]?.[area];
  if (!byArea) return null;
  const out: Record<string, DeployedContract> = {};
  for (const [name, c] of Object.entries(byArea)) out[name] = { address: c.address as Address, deployBlock: c.deployBlock ?? null };
  return out;
}

export function isDeployed(area: Area, chainId: number, source?: Generated): boolean {
  return deploymentOf(area, chainId, source) !== null;
}

/** The typed "not on this network yet" reading every undeployed area answers. */
export function notDeployed<T>(area: Area, chainId: number): Reading<T> {
  return err(diagnosis("not-deployed", `${area} is not deployed on chain ${chainId}`));
}
