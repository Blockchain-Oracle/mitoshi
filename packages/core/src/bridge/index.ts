/**
 * The bridge's leg state machine (plan S1 1a stub; S14w wires it to LayerZero guids; E.3 "stepper + tracker"; D-227
 * R4-12 adds the routes, the compose message, LZ Scan legs, the tracker and the reserve check).
 *
 * A bridge-in from Robinhood Chain is one or two LayerZero legs (testnet hops through Base Sepolia, Q-009). Each leg
 * moves `source-sent → verified → delivered`, or waits `stuck` (verified, the destination call reverted: anyone can
 * re-run it), or ends `deferred` (the adapter defers a mint it can't make: claim or resend, never lost) or `failed`.
 * The flow's status is derived, never stored, so a relaunch recomputes it.
 */
import type { StuckReason } from "./scan";

export type LegStatus = "source-pending" | "source-sent" | "verified" | "delivered" | "stuck" | "deferred" | "failed";

export interface BridgeLeg {
  /** LayerZero message guid once the source tx emitted it; null before. */
  guid: `0x${string}` | null;
  status: LegStatus;
  /** Why a `stuck` leg waits; null otherwise. */
  stuck?: StuckReason | null;
}

export type BridgeStatus = "waiting-for-wallet" | "in-flight" | "stuck" | "action-needed" | "delivered" | "failed";

/** The whole flow's status from its legs, in order. */
export function bridgeStatusOf(legs: readonly BridgeLeg[]): BridgeStatus {
  if (legs.length === 0) return "waiting-for-wallet";
  if (legs.some((l) => l.status === "failed")) return "failed";
  if (legs.some((l) => l.status === "deferred")) return "action-needed";
  if (legs.every((l) => l.status === "delivered")) return "delivered";
  if (legs[0]!.status === "source-pending") return "waiting-for-wallet";
  if (legs.some((l) => l.status === "stuck")) return "stuck";
  return "in-flight";
}

/** The step the stepper highlights: the first leg not yet delivered (legs.length when all are). */
export function activeLegIndex(legs: readonly BridgeLeg[]): number {
  const i = legs.findIndex((l) => l.status !== "delivered");
  return i === -1 ? legs.length : i;
}

export * from "./route";
export * from "./compose";
export * from "./scan";
export * from "./tracker";
export * from "./conservation";
export * from "./types";
