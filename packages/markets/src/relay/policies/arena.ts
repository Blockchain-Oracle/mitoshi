/**
 * Relay policy for the `arena` area — the duel arena (R4-9, D-227). The trading-balance rule (D-118, D-177): sponsor
 * the exits and the permissionless cranks; never capital intake, delegation setup, the operator's reveal or admin.
 *
 * - `sponsor`: `claimCredit` (pays the named player only, never the caller — AD-5), `cancelMatch` (the creator's own pot
 *   home), `refundUnjoined`, `refundUnrevealed`, `lockPicks`, `settleCard`, `finalize` (permissionless; the money goes
 *   where the arena already recorded it should), `sweep` (only the arena's own engine credit).
 * - `never`: `createMatch`, `createMatchWithAgent`, `joinMatch`, `joinMatchWithAgent`, `placePick`, `placePickFor` (a pot
 *   or a stake is capital intake), `authorizeAgent` (delegation setup, as the vault's `grant`), `revealDeck` (the
 *   settler's own write, paid from the ops budget), and `setParams`/`setTier`/`setPaused`/`setAdmin`.
 * - Geofence: entry and picks are the markets entry (Q-008); exits stay open everywhere.
 * - `maxGas`: see `ARENA_MAX_GAS`.
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { gameArenaAbi } from "@cwf/clients/abis/GameArena";
import type { RelayPolicy } from "../types";

const byChain = relayTargets as Record<string, Record<string, readonly string[]>>;
/** The GameArena on every chain it is deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(byChain).flatMap((areas) => (areas.arena ?? []) as Address[]);

/** `settleCard` redeems both seats' picks (two measured partial redeems) — the heaviest sponsored call; 3M keeps ≥ 2× headroom. */
export const ARENA_MAX_GAS = 3_000_000n;

export const arenaPolicy: RelayPolicy = {
  area: "arena",
  targets,
  abi: gameArenaAbi as Abi,
  sponsor: ["claimCredit", "cancelMatch", "refundUnjoined", "refundUnrevealed", "lockPicks", "settleCard", "finalize", "sweep"],
  never: [
    "createMatch",
    "createMatchWithAgent",
    "joinMatch",
    "joinMatchWithAgent",
    "placePick",
    "placePickFor",
    "authorizeAgent",
    "revealDeck",
    "setParams",
    "setTier",
    "setPaused",
    "setAdmin",
  ],
  pillar: "markets",
  entry: ["createMatch", "createMatchWithAgent", "joinMatch", "joinMatchWithAgent", "placePick", "placePickFor"],
  maxGas: ARENA_MAX_GAS,
};
