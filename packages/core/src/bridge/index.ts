/**
 * The bridge's leg state machine (plan S1 1a stub; S14w wires it to LayerZero guids; E.3 "stepper + tracker").
 *
 * A bridge-in from Robinhood Chain is one or two LayerZero legs (testnet hops through Base Sepolia, Q-009). Each leg
 * moves `source-sent → verified → delivered`, or ends `deferred` (the adapter defers a mint it can't make: claim or
 * resend, never lost) or `failed`. The flow's status is derived, never stored, so a relaunch recomputes it.
 */
export type LegStatus = "source-pending" | "source-sent" | "verified" | "delivered" | "deferred" | "failed";

export interface BridgeLeg {
  /** LayerZero message guid once the source tx emitted it; null before. */
  guid: `0x${string}` | null;
  status: LegStatus;
}

export type BridgeStatus = "waiting-for-wallet" | "in-flight" | "action-needed" | "delivered" | "failed";

/** The whole flow's status from its legs, in order. */
export function bridgeStatusOf(legs: readonly BridgeLeg[]): BridgeStatus {
  if (legs.length === 0) return "waiting-for-wallet";
  if (legs.some((l) => l.status === "failed")) return "failed";
  if (legs.some((l) => l.status === "deferred")) return "action-needed";
  if (legs.every((l) => l.status === "delivered")) return "delivered";
  if (legs[0]!.status === "source-pending") return "waiting-for-wallet";
  return "in-flight";
}

/** The step the stepper highlights: the first leg not yet delivered (legs.length when all are). */
export function activeLegIndex(legs: readonly BridgeLeg[]): number {
  const i = legs.findIndex((l) => l.status !== "delivered");
  return i === -1 ? legs.length : i;
}
