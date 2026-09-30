/**
 * Relay policy for the `leverage` area — the Boost reserve (plan C.3.3, S10c; A.4.3). D-166's rule (D-175): the relay
 * pays for a holder's own trade and exit and for the permissionless cranks that only ever pay the position's owner or
 * `msg.sender`, never for capital intake or admin.
 *
 * - `sponsor`: `open` (the owner's own stake, sized and charged by the chain, never more than the stake), `close` (the
 *   owner's cash-out), `knockOut` and `settle` (permissionless; repay the reserve first, pay the rest to the owner —
 *   the leverage-keeper and any user may crank them), `claimOwed` and `withdraw` (pay `msg.sender`, P12 pre-checked),
 *   `sweep` (moves only the reserve's own engine credit into its wallet).
 * - `never`: `supply` (capital intake, D-020/D-029) and the admin surface `setParams`, `setPaused`, `setAdmin`.
 * - Approvals: only `pathUSD.approve(reserve, exact)` rides along with an open (the validator's spender check).
 * - Geofence: `open` is the markets entry (Q-008); exits, knock-outs and settlement stay open everywhere.
 * - `maxGas`: see `LEVERAGE_MAX_GAS`.
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { leverageReserveAbi } from "@cwf/clients/abis/LeverageReserve";
import type { RelayPolicy } from "../types";

const byChain = relayTargets as Record<string, Record<string, readonly string[]>>;
/** The LeverageReserve on every chain it is deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(byChain).flatMap((areas) => (areas.leverage ?? []) as Address[]);

/**
 * An open is the heaviest call: a guard spot verification (five signatures), the entry walk, a measured IOC at the
 * 16/4 caps (≈ 1.95M gross, engine-gas.md) with the reserve's first position slots in a Window, the rested exit walk,
 * and a new position (≈ 10 fresh slots at 250k on Tempo). 7M keeps ≥ 1.5× headroom (acceptance/S10.md records live gas).
 */
export const LEVERAGE_MAX_GAS = 7_000_000n;

export const leveragePolicy: RelayPolicy = {
  area: "leverage",
  targets,
  abi: leverageReserveAbi as Abi,
  sponsor: ["open", "close", "knockOut", "settle", "claimOwed", "withdraw", "sweep"],
  never: ["supply", "setParams", "setPaused", "setAdmin"],
  pillar: "markets",
  entry: ["open"],
  maxGas: LEVERAGE_MAX_GAS,
};
