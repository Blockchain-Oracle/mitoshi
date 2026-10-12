/**
 * One transfer's state from what LayerZero Scan and the receipts show (S14 14o/14w; D-227 R4-12), pure — shared by
 * ops `bridge-watch` (which persists it in `bridge_messages`) and the browser's tracker (which polls LayerZero Scan
 * itself, so a transfer is followed even before ops sees it). Legs, the row status, the tracker phase and, once
 * delivered, the measured duration (source block → final delivery) the ETA medians come from.
 */
import type { BridgeDirection } from "./route";
import type { Network } from "../constants/network";
import { legFromScan, type ScanMessage, type StuckReason } from "./scan";
import { trackerPhase, type BridgeEta, type TrackerPhase } from "./tracker";
import { routeOf } from "./route";
import type { BridgeLeg, LegStatus } from "./index";
import type { DeferReason } from "./types";

export type BridgeRowStatus = "pending" | "in-flight" | "stuck" | "deferred" | "delivered" | "failed" | "reverted";

/** One leg as last seen; times are block seconds. */
export interface LegRecord {
  guid: string | null;
  status: LegStatus;
  stuck: StuckReason | null;
  srcTx: string | null;
  srcAtSec: number | null;
  verifiedAtSec: number | null;
  dstTx: string | null;
  dstAtSec: number | null;
  /** Set when the destination held the credit (`CreditDeferred` / `UnlockDeferred`). */
  deferReason?: string | null;
}

export interface BridgeAdvance {
  status: BridgeRowStatus;
  phase: TrackerPhase;
  legs: LegRecord[];
  lastError?: string | null;
  deliveredAtMs?: number | null;
  durationSec?: number | null;
}

export interface LegObservation {
  msg: ScanMessage | null;
  /** The destination held this leg's credit (read from the delivery receipt). */
  deferral: DeferReason | null;
}

export interface TransferObservation {
  /** The source transaction's receipt; null while the chain has none. */
  src: "success" | "reverted" | null;
  legs: LegObservation[];
  /** The hop sent the tokens back to the sender instead of on (an invalid compose instruction). */
  bounced: boolean;
}

export interface TransferView {
  direction: BridgeDirection;
  network: Network;
  srcTx: string;
  legs: readonly LegRecord[];
  createdAtMs: number;
}

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

export function advanceTransfer(row: TransferView, obs: TransferObservation, eta: BridgeEta | null, nowMs: number): BridgeAdvance {
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
