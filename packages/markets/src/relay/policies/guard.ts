/**
 * Relay policy for the `guard` area (plan C.3.3, B.3.2–B.3.3, S15b): StockReference + StockGuardHook.
 *
 * S15b sponsors nothing here. The permissionless price pushes (`pushRedStone`, `pushDataStreams`) are paid by the ops
 * `reference-writer` from its own key, and the hook has no user entry point (PoolManager calls it). S15d decides whether
 * a buy/sell batch may prepend a `pushRedStone` to refresh a stale reference (then it moves to `sponsor` with a gas
 * cap: ≈ 0.15M per payload through `verifySpot`). `never`: owner/keeper administration of either contract.
 * Shape = `launch.ts` until S1's `RelayPolicy` type lands; listed in `policies/index.ts` then.
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { stockGuardHookAbi } from "@cwf/clients/abis/StockGuardHook";
import { stockReferenceAbi } from "@cwf/clients/abis/StockReference";

/** StockReference + StockGuardHook on every chain they are deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(relayTargets as Record<string, Record<string, readonly string[]>>).flatMap((byArea) => (byArea.guard ?? []) as Address[]);

export const guardPolicy = {
  area: "guard" as const,
  targets,
  abi: [...stockReferenceAbi, ...stockGuardHookAbi] as Abi,
  sponsor: [] as readonly string[],
  never: [
    "registerPool", "setGuard", "setFeeds", "pushKeeper", "setSession", "setHalted",
    "grantRole", "revokeRole", "renounceRole", "transferOwnership", "acceptOwnership", "renounceOwnership",
  ] as readonly string[],
  pillar: "stocks" as const,
  entry: [] as readonly string[],
  maxGas: 0n,
};
