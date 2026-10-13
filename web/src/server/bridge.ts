import "server-only";
/**
 * The bridge's records for `/api/bridge` and `/api/reserves` (S14 14o; D-227 R4-12): one store per process, and the
 * rows as the browser reads them (amounts as decimal strings; nothing private — every field is public chain data).
 */
import { createPgBridgeStore, createPgReserveStore, type BridgeMessageRow, type BridgeStore, type ReserveSnapshotRow, type ReserveStore } from "@cwf/db";
import { db } from "./db";

let bridge: BridgeStore | null = null;
let reserves: ReserveStore | null = null;

export function bridgeStore(): BridgeStore {
  bridge ??= createPgBridgeStore(db());
  return bridge;
}

export function reserveStore(): ReserveStore {
  reserves ??= createPgReserveStore(db());
  return reserves;
}

export function publicTransfer(r: BridgeMessageRow) {
  return {
    direction: r.direction, ticker: r.ticker, srcChainId: r.srcChainId, srcTx: r.srcTx, sender: r.sender, recipient: r.recipient,
    amountSD: r.amountSD.toString(), status: r.status, phase: r.phase, legs: r.legs, lastError: r.lastError,
    createdAtMs: r.createdAtMs, updatedAtMs: r.updatedAtMs, deliveredAtMs: r.deliveredAtMs, durationSec: r.durationSec,
  };
}
export type PublicTransfer = ReturnType<typeof publicTransfer>;

const s = (v: bigint | null) => (v === null ? null : v.toString());

export function publicSnapshot(r: ReserveSnapshotRow) {
  return {
    ticker: r.ticker, atMs: r.atMs, tempoBlock: r.tempoBlock.toString(), baseBlock: s(r.baseBlock), rhBlock: s(r.rhBlock),
    supplySD: r.supplySD.toString(), deferredSD: r.deferredSD.toString(), lockedSD: s(r.lockedSD), issuers: r.issuers, issuersToBlock: s(r.issuersToBlock),
    verdict: r.verdict, checks: r.checks, alert: r.alert,
  };
}
export type PublicSnapshot = ReturnType<typeof publicSnapshot>;
