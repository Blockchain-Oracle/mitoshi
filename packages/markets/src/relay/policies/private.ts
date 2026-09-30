/**
 * Relay policy for the `private` area — the private desk (plan C.3.3, S10d; A.4.4). The trading-balance rule (D-118,
 * D-177): sponsor an owner's exits and the permissionless crank; never capital intake, delegation setup, the desk
 * key's own writes, or admin.
 *
 * - `sponsor`: `withdraw` (pays `msg.sender` only, P12 pre-checked), `revoke` (cancelling the desk's permission must
 *   never need funds), `settleSlot` (permissionless; the payout stays in the slot), `sweep` (moves only the desk's own
 *   engine credit into its pool).
 * - `never`: `deposit`, `depositAndAllow` (capital intake, D-020/D-029), `allow` (delegation setup, as the vault's
 *   `grant`), the desk key's `chargeToPool`, `fundSlot`, `mintInSlot`, `sweepSlotToPool`, `creditFromPool` (the desk
 *   service pays its own fees from the ops budget, like the maker's `quote`), and `setDesk`/`setParams`/`setPaused`/
 *   `setAdmin`.
 * - Geofence: `deposit`/`depositAndAllow` are the markets entry (Q-008); exits stay open everywhere.
 * - `maxGas`: see `PRIVATE_MAX_GAS`.
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { privateDeskAbi } from "@cwf/clients/abis/PrivateDesk";
import type { RelayPolicy } from "../types";

const byChain = relayTargets as Record<string, Record<string, readonly string[]>>;
/** The PrivateDesk on every chain it is deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(byChain).flatMap((areas) => (areas.private ?? []) as Address[]);

/** `settleSlot` (a measured partial redeem + the slot's slots) is the heaviest sponsored call; 3M keeps ≥ 2× headroom. */
export const PRIVATE_MAX_GAS = 3_000_000n;

export const privatePolicy: RelayPolicy = {
  area: "private",
  targets,
  abi: privateDeskAbi as Abi,
  sponsor: ["withdraw", "revoke", "settleSlot", "sweep"],
  never: [
    "deposit",
    "depositAndAllow",
    "allow",
    "chargeToPool",
    "fundSlot",
    "mintInSlot",
    "sweepSlotToPool",
    "creditFromPool",
    "setDesk",
    "setParams",
    "setPaused",
    "setAdmin",
  ],
  pillar: "markets",
  entry: ["deposit", "depositAndAllow"],
  maxGas: PRIVATE_MAX_GAS,
};
