/**
 * Relay policy for the `maker` area — the Earn maker vault (plan C.3.3, S8; A.4.2). Shape = `vault.ts` / `engine.ts`
 * until S1's `RelayPolicy` type lands. Masayume had no sponsor list for its maker vault (suppliers paid their own gas
 * through the forwarder-less path); ours follows the Trading Balance's rule (D-118): sponsor the exits and the
 * permissionless keeper calls that only ever move the vault's own money, never capital intake or admin.
 *
 * - `sponsor`: `withdraw` (a supplier's exit; pays `msg.sender` only, P12 pre-checked), `pull` (the maker any time,
 *   anyone after `lockAt`; credit lands only in the vault), `merge` (pairs → collateral into the vault), `settle`
 *   (pull + one full redeem into the vault; "Settling 2 of 4" before a withdraw is these calls).
 * - `never`: `supply` (capital intake: the supplier pays for their own money moving in, D-020/D-029), `quote` (the
 *   earn-quoter key pays its own fees from the ops budget), and the admin surface `setParams`, `setMaker`,
 *   `setPaused`, `setAdmin`.
 * - Geofence: `supply` is the markets entry (Q-008: it opens exposure to Windows); exits stay open everywhere.
 * - `maxGas`: measured on Moderato (acceptance/S8.md): see `MAKER_MAX_GAS` below.
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { marketMakerVaultAbi } from "@cwf/clients/abis/MarketMakerVault";

const byChain = relayTargets as Record<string, Record<string, readonly string[]>>;
/** The MarketMakerVault on every chain it is deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(byChain).flatMap((areas) => (areas.maker ?? []) as Address[]);

/**
 * Measured live on Moderato (acceptance/S8.md): `merge` 461,769 (2 pairs, first credit/position slots), `pull`
 * 226,773 (cancel 1 order + collect), `settle` 248,236 (void, nothing resting), `withdraw` 54,731. The worst case is
 * `settle` on a Window with 16 resting orders (cancel-all ≈ 35k each) plus a full redeem; 2M keeps ≥ 2× headroom.
 */
const MAKER_MAX_GAS = 2_000_000n;

export const makerPolicy = {
  area: "maker" as const,
  targets,
  abi: marketMakerVaultAbi as Abi,
  sponsor: ["withdraw", "pull", "merge", "settle"] as readonly string[],
  never: ["supply", "quote", "setParams", "setMaker", "setPaused", "setAdmin"] as readonly string[],
  pillar: "markets" as const,
  entry: ["supply"] as readonly string[],
  maxGas: MAKER_MAX_GAS,
};
