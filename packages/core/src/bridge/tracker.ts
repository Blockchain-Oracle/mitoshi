/**
 * The in-flight tracker's one status line (S14w E.3 "never a bare spinner"; D-227 R4-12) and the honest ETA. The phase
 * is derived from the legs every time (a relaunch recomputes it); the ETA exists only once bridge-watch has measured a
 * delivered transfer (the median of real legs), never a figure from a doc.
 */
import type { Hex } from "../types/primitives";
import type { BridgeLeg } from "./index";
import type { BridgeRoute } from "./route";

/**
 * - `wallet`: no source hash yet ("Waiting for your wallet…")
 * - `sent`: the first leg left the source chain
 * - `hop`: the first leg reached Base and the second is on its way (testnet)
 * - `delivered`: every leg delivered
 * - `deferred`: the destination held the credit (claim it, or send it back)
 * - `fuel`: the hop's compose is stored because the Base float can't pay the next leg (ops tops up and retries)
 * - `slow`: past the measured p95, or a verified message the executor could not run yet
 * - `nothing`: the source transaction reverted; nothing moved
 */
export type TrackerPhase = "wallet" | "sent" | "hop" | "delivered" | "deferred" | "fuel" | "slow" | "nothing";

export interface BridgeEta {
  medianSec: number;
  p95Sec: number;
  samples: number;
}

/** Median and nearest-rank p95 of measured whole-transfer durations; null with no measurement. */
export function etaOf(durationsSec: readonly number[]): BridgeEta | null {
  const xs = durationsSec.filter((d) => Number.isFinite(d) && d >= 0).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  const medianSec = xs.length % 2 ? xs[mid]! : Math.round((xs[mid - 1]! + xs[mid]!) / 2);
  const p95Sec = xs[Math.min(xs.length - 1, Math.ceil(0.95 * xs.length) - 1)]!;
  return { medianSec, p95Sec, samples: xs.length };
}

export interface TrackerInput {
  route: BridgeRoute;
  legs: readonly BridgeLeg[];
  srcTx: Hex | null;
  /** The source transaction reverted (its receipt said so). */
  srcReverted: boolean;
  startedAtMs: number;
  nowMs: number;
  eta: BridgeEta | null;
}

export function trackerPhase(t: TrackerInput): TrackerPhase {
  if (!t.srcTx) return "wallet";
  if (t.srcReverted) return "nothing";
  if (t.legs.some((l) => l.status === "deferred")) return "deferred";
  if (t.legs.length === t.route.legs.length && t.legs.every((l) => l.status === "delivered")) return "delivered";
  if (t.legs.some((l) => l.status === "stuck" && l.stuck === "compose")) return "fuel";
  if (t.legs.some((l) => l.status === "stuck") || (t.eta && t.nowMs - t.startedAtMs > t.eta.p95Sec * 1000)) return "slow";
  return t.legs[0]?.status === "delivered" && t.route.legs.length > 1 ? "hop" : "sent";
}

/** How many of the route's segments are filled (delivered legs, in order) — the route map's progress. */
export function deliveredLegs(legs: readonly BridgeLeg[]): number {
  let n = 0;
  for (const l of legs) {
    if (l.status !== "delivered") break;
    n += 1;
  }
  return n;
}
