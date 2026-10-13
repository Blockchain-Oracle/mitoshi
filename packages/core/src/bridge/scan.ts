/**
 * LayerZero Scan → leg status (S14w; D-227 R4-12). LZ Scan's `/v1/messages/{tx|guid}/…` answers one record per message
 * with its source, DVN verification, destination execution and (on the hop) compose. `parseScanMessage` reads that JSON
 * defensively into a small typed record (anything missing is null, never a guess); `legFromScan` decides the leg.
 *
 * A message the DVN verified but whose destination call reverted (our 2026-09-29 ping ran out of gas into Tempo) is
 * `stuck`, not failed: the packet is committed at the endpoint and anyone can re-run it. A compose leg is delivered only
 * once its compose ran too — an empty Base float leaves the compose stored (`HopComposer.InsufficientFloat`).
 */
import type { Hex } from "../types/primitives";
import type { LegStatus } from "./index";

export interface ScanMessage {
  guid: Hex | null;
  srcEid: number | null;
  dstEid: number | null;
  /** LZ Scan's overall status name (INFLIGHT, CONFIRMING, DELIVERED, FAILED, BLOCKED, PAYLOAD_STORED, …). */
  status: string;
  srcTx: Hex | null;
  srcAtSec: number | null;
  /** The required DVN's verification (its block time), once it verified. */
  dvnStatus: string | null;
  verifiedAtSec: number | null;
  /** WAITING, SUCCEEDED, FAILED, SIMULATION_REVERTED, … */
  dstStatus: string | null;
  dstTx: Hex | null;
  dstAtSec: number | null;
  /** N/A on a plain leg; the hop's compose status otherwise. */
  composeStatus: string | null;
  composeTx: Hex | null;
  composeAtSec: number | null;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const hex = (v: unknown): Hex | null => (typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v) ? (v.toLowerCase() as Hex) : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** When verification completed: the latest block time among the DVNs that verified (one required DVN on testnet). */
function verifiedAt(dvns: Json | null): number | null {
  const times = Object.values(dvns ?? {}).map((d) => num(obj(d)?.blockTimestamp)).filter((t): t is number => t !== null);
  return times.length ? Math.max(...times) : null;
}

/** One LZ Scan record (an element of `data[]`) → a typed message; null when it is not a message record. */
export function parseScanMessage(raw: unknown): ScanMessage | null {
  const m = obj(raw);
  const pathway = obj(m?.pathway);
  const status = str(obj(m?.status)?.name);
  if (!m || !pathway || !status) return null;
  const source = obj(obj(m.source)?.tx);
  const dvn = obj(obj(m.verification)?.dvn);
  const dst = obj(m.destination);
  const dstTx = obj(dst?.tx);
  const compose = obj(dst?.lzCompose);
  const composeTxs = Array.isArray(compose?.txs) ? (compose!.txs as unknown[]) : [];
  const lastCompose = obj(composeTxs[composeTxs.length - 1]);
  return {
    guid: hex(m.guid),
    srcEid: num(pathway.srcEid),
    dstEid: num(pathway.dstEid),
    status,
    srcTx: hex(source?.txHash),
    srcAtSec: num(source?.blockTimestamp),
    dvnStatus: str(dvn?.status),
    verifiedAtSec: str(dvn?.status) === "SUCCEEDED" ? verifiedAt(obj(dvn?.dvns)) : null,
    dstStatus: str(dst?.status),
    dstTx: hex(dstTx?.txHash),
    dstAtSec: num(dstTx?.blockTimestamp),
    composeStatus: str(compose?.status),
    composeTx: hex(lastCompose?.txHash),
    composeAtSec: num(lastCompose?.blockTimestamp),
  };
}

/** The `data[]` of an LZ Scan answer, parsed; an unknown shape reads as no messages. */
export function parseScanList(raw: unknown): ScanMessage[] {
  const data = obj(raw)?.data;
  return Array.isArray(data) ? data.map(parseScanMessage).filter((m): m is ScanMessage => m !== null) : [];
}

/** Why a verified message has not run yet: the executor's call reverted, or (on the hop) the compose did. */
export type StuckReason = "executor" | "compose";

export interface ScannedLeg {
  status: LegStatus;
  stuck: StuckReason | null;
}

const RETRYABLE = new Set(["FAILED", "BLOCKED", "PAYLOAD_STORED", "SIMULATION_REVERTED", "UNRESOLVABLE_COMMAND"]);
const DEAD = new Set(["APPLICATION_BURNED", "APPLICATION_SKIPPED", "MALFORMED_COMMAND"]);
const COMPOSE_STUCK = new Set(["FAILED", "SIMULATION_REVERTED", "PAYLOAD_STORED", "BLOCKED"]);

/** A leg's status from its LZ Scan record; `compose` legs need their compose to have run as well. */
export function legFromScan(msg: ScanMessage, compose: boolean): ScannedLeg {
  if (DEAD.has(msg.status)) return { status: "failed", stuck: null };
  const received = msg.status === "DELIVERED" || msg.dstStatus === "SUCCEEDED";
  if (received) {
    if (!compose || msg.composeStatus === "SUCCEEDED") return { status: "delivered", stuck: null };
    if (msg.composeStatus && COMPOSE_STUCK.has(msg.composeStatus)) return { status: "stuck", stuck: "compose" };
    return { status: "verified", stuck: null };
  }
  if (RETRYABLE.has(msg.status) || (msg.dstStatus && RETRYABLE.has(msg.dstStatus))) return { status: "stuck", stuck: "executor" };
  if (msg.dvnStatus === "SUCCEEDED") return { status: "verified", stuck: null };
  return { status: "source-sent", stuck: null };
}

/** Seconds from the source block to the destination's execution (and compose, on the hop), once both are known. */
export function legDurationSec(msg: ScanMessage, compose: boolean): number | null {
  const end = compose ? msg.composeAtSec : msg.dstAtSec;
  return msg.srcAtSec !== null && end !== null && end >= msg.srcAtSec ? end - msg.srcAtSec : null;
}
