/**
 * Relay policy for the `parlay` area — the parlay reserve (plan C.3.3, S10a; A.4.6). Masayume had no sponsor list for
 * its reserves (openers paid their own gas on Somnia); ours follows the engine's rule (D-135, D-166): the relay pays for
 * a holder's own trade and for exits and permissionless cranks that only ever pay the ticket's owner or `msg.sender`,
 * never for capital intake or admin.
 *
 * - `sponsor`: `openParlay` (the opener's own stake at the chain's floored price, bounded by their `maxStake`, like
 *   `EventsEngine.placeOrder`), `resolveLeg` (permissionless, idempotent; D-108 order), `claim` (pays the owner only,
 *   whoever calls), `claimOwed` and `withdraw` (pay `msg.sender` only, P12 pre-checked).
 * - `never`: `supply` (capital intake: a supplier pays for their own money moving in, D-020/D-029) and the admin
 *   surface `setParams`, `setPaused`, `setAdmin`.
 * - Approvals: only `pathUSD.approve(reserve, exact)` rides along with an open (the validator's spender check).
 * - Geofence: `openParlay` is the markets entry (Q-008); settlement, claims and withdrawals stay open everywhere.
 * - `maxGas`: see `PARLAY_MAX_GAS`.
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { parlayReserveAbi } from "@cwf/clients/abis/ParlayReserve";
import type { RelayPolicy } from "../types";

const byChain = relayTargets as Record<string, Record<string, readonly string[]>>;
/** The ParlayReserve on every chain it is deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(byChain).flatMap((areas) => (areas.parlay ?? []) as Address[]);

/**
 * Measured live on Moderato (acceptance/S10.md): a first two-leg open (a new ticket, its legs, the owner's list, two
 * RedStone spot verifications of five signatures each through the guard, two rested-book walks) is the heaviest call;
 * three legs and a fresh `lockedByExpiry` slot per instant add ≈ 1.5M. 6M leaves ≥ 1.5× headroom over a three-leg open.
 */
export const PARLAY_MAX_GAS = 6_000_000n;

export const parlayPolicy: RelayPolicy = {
  area: "parlay",
  targets,
  abi: parlayReserveAbi as Abi,
  sponsor: ["openParlay", "resolveLeg", "claim", "claimOwed", "withdraw"],
  never: ["supply", "setParams", "setPaused", "setAdmin"],
  pillar: "markets",
  entry: ["openParlay"],
  maxGas: PARLAY_MAX_GAS,
};
