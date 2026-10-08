/**
 * Relay policy for the `range` area — the range reserve behind Range and Moonshot (plan C.3.3, S10b; A.4.7). Same rule
 * as the parlay reserve (D-166, D-173): the relay pays for a holder's own round and for exits and permissionless cranks
 * that only ever pay the round's owner or `msg.sender`, never for capital intake or admin.
 *
 * - `sponsor`: `openRange` (the opener's own stake at the chain's floored price under their `maxStake`, a trade like
 *   `EventsEngine.placeOrder`), `settle` and `voidStale` (permissionless, idempotent; they pay only the owner),
 *   `claim` (pays the owner whoever calls), `claimOwed` and `withdraw` (pay `msg.sender`, P12 pre-checked).
 * - `never`: `supply` (capital intake, D-020/D-029) and the admin surface `setParams`, `setVolatility`,
 *   `setAssetTicker`, `setPaused`, `setAdmin`.
 * - Approvals: only `pathUSD.approve(reserve, exact)` rides along with an open (the validator's spender check).
 * - Geofence: `openRange` is the markets entry (Q-008); settlement, claims and withdrawals stay open everywhere.
 * - `maxGas`: see `RANGE_MAX_GAS`.
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { rangeReserveAbi } from "@cwf/clients/abis/RangeReserve";
import type { RelayPolicy } from "../types";

const byChain = relayTargets as Record<string, Record<string, readonly string[]>>;
/** The RangeReserve on every chain it is deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(byChain).flatMap((areas) => (areas.range ?? []) as Address[]);

/**
 * An open is the heaviest call: a new round (≈ 12 fresh slots at 250k on Tempo: the round, its basis, the owner's list,
 * a fresh `lockedByExpiry` slot), one RedStone spot verification of five signatures through the guard, and two rested
 * level walks. 6M keeps ≥ 1.5× headroom over a first open on a fresh instant (acceptance/S10.md records the live gas).
 */
export const RANGE_MAX_GAS = 6_000_000n;

export const rangePolicy: RelayPolicy = {
  area: "range",
  targets,
  abi: rangeReserveAbi as Abi,
  sponsor: ["openRange", "settle", "voidStale", "claim", "claimOwed", "withdraw"],
  never: ["supply", "setParams", "setVolatility", "setAssetTicker", "setPaused", "setAdmin"],
  pillar: "markets",
  entry: ["openRange"],
  maxGas: RANGE_MAX_GAS,
};
