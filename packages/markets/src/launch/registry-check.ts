/**
 * Whether an address is a launch at all (R6 money, S02 + T16; D-230): the token page's server pre-check asks the index
 * first and, when the index hasn't seen it (a seconds-old launch), the LaunchRegistry itself (`launchOf`), so an
 * unknown address is a 404 and a fresh launch never is. One `eth_call`; null where the launch area isn't deployed.
 */
import type { Address, PublicClient } from "viem";
import { launchRegistryAbi } from "@cwf/clients/abis/LaunchRegistry";
import { deploymentOf } from "../deployments";
import { memeAddresses } from "./meme";

/** `LaunchRegistry.Kind` of `token` on `chainId`: 0 none, 1 stablecoin, 2 memecoin; null without the launch area. */
export async function registryKindOf(client: PublicClient, chainId: number, token: Address): Promise<number | null> {
  if (!deploymentOf("launch", chainId) || (chainId !== 42431 && chainId !== 4217)) return null;
  const rec = await client.readContract({ address: memeAddresses(chainId).registry, abi: launchRegistryAbi, functionName: "launchOf", args: [token] });
  return Number(rec.kind);
}
