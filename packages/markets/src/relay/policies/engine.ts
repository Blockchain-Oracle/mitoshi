/**
 * Relay policy for the `engine` area (plan C.3.3; S2.11 lands the deployment, S4 owns the first-call flow and may
 * widen it through a D-entry). Shape = `launch.ts` (S17a) until S1's `RelayPolicy` type lands.
 *
 * - `sponsor`: a holder's own trading and exits from the wallet (D-047 wallet mode): place, cancel, reduce, cancel-all,
 *   merge, withdraw credit, redeem (full and partial), and the crank opt-out. Every payout goes to `msg.sender`
 *   (AD-5), so sponsoring them moves nobody else's money.
 * - Not sponsored (absent from both lists, the sender pays): `mintSet` (pure capital intake into a position, D-020's
 *   spirit), and the permissionless keeper calls (`recordPrint`, `copyOpenFromPrev`, `settle`, `voidExpired`,
 *   `sweepExpired`, `redeemFor`, `reserveNodes`, `sweepSurplus`) — ops actors sign and pay those themselves.
 * - `never`: the admin and roller surface.
 * - Geofence: `placeOrder` is the markets entry (refused for restricted regions, Q-008); exits stay open everywhere.
 * - `maxGas`: a placement at the 16/16 caps is ≈ 1.95M gross (engine-gas.md) plus intrinsic; 3M leaves room for a new
 *   holder's two new slots.
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";

/** Only the engine itself (the lens and verifiers are never called through the relay). */
const engineAddresses = (): Address[] => {
  const out: Address[] = [];
  const byChain = relayTargets as Record<string, Record<string, readonly string[]>>;
  for (const areas of Object.values(byChain)) {
    const all = (areas.engine ?? []) as Address[];
    if (all.length > 0) out.push(...all);
  }
  return out;
};

export const enginePolicy = {
  area: "engine" as const,
  targets: engineAddresses(),
  abi: eventsEngineAbi as Abi,
  sponsor: [
    "placeOrder",
    "cancelOrders",
    "reduceOrder",
    "cancelAll",
    "mergeSet",
    "withdrawCredit",
    "redeem",
    "redeemPartial",
    "setCrankOptOut",
  ] as readonly string[],
  never: ["registerSeries", "addPolicyVersion", "openWindow", "setMode", "setRoller", "transferAdmin", "acceptAdmin"] as readonly string[],
  pillar: "markets" as const,
  entry: ["placeOrder"] as readonly string[],
  maxGas: 3_000_000n,
};
