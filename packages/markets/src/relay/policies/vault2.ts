/**
 * Relay policy for the `vault2` area — the Trading Balance v2 (S24.1/S24.2, D-193): v1's list (`vault.ts`) unchanged,
 * with the EXIT grant placed:
 * - `grantExit` is delegation setup, so it is `never` sponsored (the owner pays for arming it, as for `grant`; the
 *   `relay-policy-coverage` invariant reads this list).
 * - `exitFor` is in neither list: the exit keeper sends it and pays its own gas (S24.3), so no browser ever asks.
 * - `placeFor` keeps v1's on-chain check (the grant's own actor, the grant live); an EXIT grant can't use it anyway
 *   (`ExitGrantSellsOnly`), and that refusal shows in the fill estimate, which sends nothing.
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import { vaultPolicy, vaultSender } from "./vault";

const byChain = relayTargets as Record<string, Record<string, readonly string[]>>;
/** The EventVaultV2 on every chain it is deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(byChain).flatMap((areas) => (areas.vault2 ?? []) as Address[]);

export const vault2Policy = {
  ...vaultPolicy,
  area: "vault2" as const,
  targets,
  abi: eventVaultV2Abi as Abi,
  never: [...vaultPolicy.never, "grantExit"] as readonly string[],
  asyncSender: vaultSender,
};
