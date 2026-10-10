/**
 * Relay policy for the `strategies` area — the StrategyRegistry (plan C.3.3, S9; A.4.8). The engine's rule (D-135,
 * D-166): the relay pays for exits, never for money moving or for what a creator builds.
 *
 * - `sponsor`: the exits — `unsubscribe` (the copier's stop, batched with the vault's sponsored `revoke`; D-218.2) and
 *   `deactivate` (the creator stops new copies).
 * - `never`: `subscribe` (it pays the creator's fee; copy is self-paid, D-218.2, and its batch carries the vault's
 *   `grant`, never sponsored either), `publish` / `update` (a creator's own build; metadata is an SSTORE2 CREATE of up
 *   to 8 KB, root-signed, D-019), `setRunner` (admin).
 * - Geofence: none of these is a markets entry — the money enters through the vault's `grant`, already refused for a
 *   restricted visitor's relay path by never being sponsored; exits stay open everywhere.
 * - Companion: the vault's `revoke` may ride in a `strategies` transaction, so stop is one sponsored exit (revoke the
 *   STRATEGY grant + `unsubscribe`, D-218.2); `revoke` still passes the vault's own policy.
 * - `maxGas`: an `unsubscribe` writes two warm slots; `deactivate` one. 300k is ≥ 3× either; the revoke adds its own
 *   (it returns the grant's budget to the Trading Balance: a handful of warm writes).
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import type { RelayPolicy } from "../types";

const byChain = relayTargets as Record<string, Record<string, readonly string[]>>;
/** The StrategyRegistry on every chain it is deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(byChain).flatMap((areas) => (areas.strategies ?? []) as Address[]);

export const strategiesPolicy: RelayPolicy = {
  area: "strategies",
  targets,
  abi: strategyRegistryAbi as Abi,
  sponsor: ["unsubscribe", "deactivate"],
  never: ["subscribe", "publish", "update", "setRunner"],
  pillar: null,
  entry: [],
  maxGas: 300_000n,
  companions: [{ area: "vault2", functions: ["revoke"], extraGas: 300_000n }],
};
