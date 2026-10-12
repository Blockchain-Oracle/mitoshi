/**
 * Where the Earn maker vault lives on one chain (S8; AD-10): the `maker` area's `MarketMakerVault`, from the generated
 * deployment fragments. Null where the vault is not deployed — every read then answers "not deployed", never a mock.
 */
import type { Address } from "viem";
import type { MakerDeployment } from "@cwf/core/maker";
import { deploymentOf } from "../deployments";

export function makerVenueOf(chainId: number): MakerDeployment | null {
  const c = deploymentOf("maker", chainId)?.MarketMakerVault;
  return c ? { chainId, marketMakerVault: c.address as Address, fromBlock: BigInt(c.deployBlock ?? 0) } : null;
}
