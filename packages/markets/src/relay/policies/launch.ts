/**
 * Relay policy for the `launch` area (plan C.3.3; S17a stablecoin registry, S17b memecoin launchpad + locker).
 *
 * - `sponsor` (S17b): a holder's own curve trades and claims — `createLaunch` (the creator's single call; its optional
 *   creator buy is a buy), `buy`, `sell`, `claimFees`, `claimLeftover`, and the locker's `withdraw`/`claimFees`. Every
 *   payout goes to `msg.sender` after a receive-policy pre-check, so sponsoring them moves nobody else's money (plan
 *   C.2.3 "curve buy-sell-create … yes"). The batch's exact `approve` to pathUSD/the coin rides in front of the call.
 * - Not sponsored (absent from both lists, the sender pays): the stablecoin batch (capital intake, nine calls over
 *   five targets, D-063), `createConfig` (a partner publishing a template), and the permissionless `graduate` (the
 *   launch keeper signs and pays it, like the engine's keeper calls).
 * - `never`: registry records/admin, launchpad and locker admin, and the PoolManager-only callback.
 * - `maxGas`: `createLaunch` with a creator buy measured 6,736,091 on Moderato (acceptance/S17.md), locker withdraw
 *   458,715; 8M leaves room for a first-time holder's new slots.
 * Shape = `RelayPolicy` in `relay/types.ts` (S1); this file joins `policies/index.ts` when S1's relay lands on the
 * trunk. Geofence posture for launch is open everywhere (`launch: {}`, Q-008).
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { curveLaunchpadAbi } from "@cwf/clients/abis/CurveLaunchpad";
import { launchRegistryAbi } from "@cwf/clients/abis/LaunchRegistry";
import { liquidityLockerAbi } from "@cwf/clients/abis/LiquidityLocker";

/** The launch contracts on every chain they are deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(relayTargets as Record<string, Record<string, readonly string[]>>).flatMap((byArea) => (byArea.launch ?? []) as Address[]);

export const launchPolicy = {
  area: "launch" as const,
  targets,
  abi: [...launchRegistryAbi, ...curveLaunchpadAbi, ...liquidityLockerAbi] as Abi,
  sponsor: ["createLaunch", "buy", "sell", "claimFees", "claimLeftover", "withdraw"] as readonly string[],
  never: [
    "recordStablecoin", "recordMemecoin", "setCurveLaunchpad", "reserveCodes",
    "setProtocolTreasury", "setMinProtocolShare", "setLaunchpad", "register", "unlockCallback",
    "transferOwnership", "acceptOwnership", "renounceOwnership",
  ] as readonly string[],
  pillar: "launch" as const,
  entry: [] as readonly string[],
  maxGas: 8_000_000n,
};
