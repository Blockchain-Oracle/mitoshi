/**
 * bridge-watch's decision for one transfer (S14 14o; D-227 R4-12), pure: what LayerZero Scan and the receipts showed →
 * the row's legs, status, tracker phase and (once delivered) its measured duration. The I/O is in `./index.ts`.
 */
import { legFromScan, routeOf, trackerPhase, type BridgeEta, type BridgeLeg, type DeferReason, type ScanMessage, type TrackerPhase } from "@cwf/core";
import type { BridgeAdvance, BridgeMessageRow, BridgeRowStatus, LegRecord } from "@cwf/db";

export interface LegObservation {
  msg: ScanMessage | null;
  /** The destination held this leg's credit (read from the delivery receipt). */
  deferral: DeferReason | null;
}

export interface Observation {
  /** The source transaction's receipt; null while the chain has none. */
  src: "success" | "reverted" | null;
  legs: LegObservation[];
  /** The hop sent the tokens back to the sender instead of on (an invalid compose instruction). */
  bounced: boolean;
}

type RowView = Pick<BridgeMessageRow, "direction" | "network" | "srcTx" | "legs" | "createdAtMs">;

function record(prev: LegRecord | undefined, obs: LegObservation | undefined, compose: boolean, srcTx: string | null): LegRecord {
  const msg = obs?.msg ?? null;
  if (!msg) return prev ?? { guid: null, status: "source-sent", stuck: null, srcTx, srcAtSec: null, verifiedAtSec: null, dstTx: null, dstAtSec: null };
  const leg = legFromScan(msg, compose);
  const deferred = leg.status === "delivered" && obs?.deferral;
  return {
    guid: msg.guid,
    status: deferred ? "deferred" : leg.status,
    stuck: leg.stuck,
    srcTx: msg.srcTx ?? srcTx,
    srcAtSec: msg.srcAtSec,
    verifiedAtSec: msg.verifiedAtSec,
    dstTx: compose ? (msg.composeTx ?? msg.dstTx) : msg.dstTx,
    dstAtSec: compose ? (msg.composeAtSec ?? null) : msg.dstAtSec,
    deferReason: deferred ? obs!.deferral : null,
  };
}

const STATUS_OF: Record<TrackerPhase, BridgeRowStatus> = { wallet: "pending", sent: "in-flight", hop: "in-flight", slow: "in-flight", fuel: "stuck", deferred: "deferred", delivered: "delivered", nothing: "reverted" };

export function advanceTransfer(row: RowView, obs: Observation, eta: BridgeEta | null, nowMs: number): BridgeAdvance {
  const route = routeOf(row.direction, row.network);
  if (obs.src === "reverted") return { status: "reverted", phase: "nothing", legs: [], lastError: "the source transaction reverted; nothing moved" };
  const legs: LegRecord[] = [];
  for (const plan of route.legs) {
    const i = plan.index;
    // A later leg exists only once the one before it has handed over (the hop's compose sent it on).
    if (i > 0 && legs[i - 1]!.status !== "delivered" && !obs.legs[i]?.msg) break;
    legs.push(record(row.legs[i], obs.legs[i], plan.compose, i === 0 ? row.srcTx : null));
  }
  const core: BridgeLeg[] = legs.map((l) => ({ guid: l.guid as `0x${string}` | null, status: l.status, stuck: l.stuck }));
  if (obs.bounced) return { status: "failed", phase: "slow", legs, lastError: "the hop sent it back to the sender on the source chain" };
  if (core.some((l) => l.status === "failed")) return { status: "failed", phase: "slow", legs, lastError: "LayerZero refused the message" };
  const phase = trackerPhase({ route, legs: core, srcTx: row.srcTx as `0x${string}`, srcReverted: false, startedAtMs: row.createdAtMs, nowMs, eta });
  const stuck = core.some((l) => l.status === "stuck");
  const status: BridgeRowStatus = stuck && phase !== "deferred" ? "stuck" : STATUS_OF[phase];
  if (phase !== "delivered") return { status, phase, legs, lastError: null };
  const first = legs[0]!.srcAtSec;
  const last = legs[legs.length - 1]!.dstAtSec;
  const durationSec = first !== null && last !== null && last >= first ? last - first : null;
  return { status, phase, legs, lastError: null, deliveredAtMs: last !== null ? last * 1000 : nowMs, durationSec };
}
