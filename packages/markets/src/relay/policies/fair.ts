/**
 * Relay policy for the `fair` area — the PD-2 fair-value guard (A.5.4, S10.0). Shape = `engine.ts` until S1's
 * `RelayPolicy` type lands.
 *
 * - `sponsor`: nothing. Nobody sends the guard a transaction on their own behalf: the reserves call `fairUpE6` /
 *   `spotOf` inside their own opens (a same-call spot proof), and previews are `eth_call`s.
 * - `never`: the owner surface (σ per Series, the spot source per ticker, the spot age, ownership).
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { fairValueGuardAbi } from "@cwf/clients/abis/FairValueGuard";

const byChain = relayTargets as Record<string, Record<string, readonly string[]>>;
const targets: readonly Address[] = Object.values(byChain).flatMap((areas) => (areas.fair ?? []) as Address[]);

export const fairPolicy = {
  area: "fair" as const,
  targets,
  abi: fairValueGuardAbi as Abi,
  sponsor: [] as readonly string[],
  never: ["setSigma", "setSpotSource", "setMaxSpotAge", "transferOwnership", "acceptOwnership", "renounceOwnership"] as readonly string[],
  pillar: "markets" as const,
  entry: [] as readonly string[],
  maxGas: 0n,
};
