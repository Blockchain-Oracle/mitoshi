/**
 * Relay policy for the `launch` area (plan C.3.3, S17a). The relay sponsors nothing here in 17a, on purpose:
 *
 * - The stablecoin launch batch is capital intake — the creator escrows pathUSD in the bid flip order and deposits
 *   pathUSD into the FeeAMM (D-020 "capital intake is never sponsored"). It also spans five targets (factory, the new
 *   token, DEX, FeeManager, registry) and nine calls, beyond one area and the relay's 8-call cap. The creator pays its
 *   fee in pathUSD from their own account (root or access key — spike X22).
 * - `recordStablecoin` is only meaningful as call 9 of that batch, so naming it `never` refuses any request that
 *   carries it; `recordMemecoin` is the CurveLaunchpad's alone; the rest is owner administration.
 *
 * S17b adds the CurveLaunchpad's user entry points (`buy`, `sell`, `claimFees`, `graduate`) to `sponsor` with their gas
 * caps. Shape = `RelayPolicy` in `relay/types.ts` (S1); this file is listed in `policies/index.ts` when S1's relay lands
 * on the trunk. Geofence posture for launch is open everywhere (`launch: {}`, Q-008).
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { launchRegistryAbi } from "@cwf/clients/abis/LaunchRegistry";

/** The launch registry on every chain it is deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(relayTargets as Record<string, Record<string, readonly string[]>>).flatMap((byArea) => (byArea.launch ?? []) as Address[]);

export const launchPolicy = {
  area: "launch" as const,
  targets,
  abi: launchRegistryAbi as Abi,
  sponsor: [] as readonly string[],
  never: ["recordStablecoin", "recordMemecoin", "setCurveLaunchpad", "reserveCodes", "transferOwnership", "acceptOwnership", "renounceOwnership"] as readonly string[],
  pillar: "launch" as const,
  entry: [] as readonly string[],
  maxGas: 0n,
};
