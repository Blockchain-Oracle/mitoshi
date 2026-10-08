import "server-only";
/** The exit keeper's trigger store for `/api/exits` (S24.3), one per process, and the rows as the owner's terminal reads them. */
import { createPgExitTriggersStore, type ExitTriggerRow, type ExitTriggersStore } from "@cwf/db";
import { db } from "./db";

let store: ExitTriggersStore | null = null;

export function exitTriggers(): ExitTriggersStore {
  store ??= createPgExitTriggersStore(db());
  return store;
}

const text = (v: bigint | null) => (v === null ? null : v.toString());

/** A row for its owner: no signature, money and spots as decimal strings. */
export function publicExitRow(r: ExitTriggerRow) {
  return {
    vault: r.vault, market: r.market, side: r.side, status: r.status, reason: r.reason,
    takeProfitBase: text(r.takeProfitBase), stopLossBase: text(r.stopLossBase), trailBps: r.trailBps, trailStopE8: text(r.trailStopE8),
    nonce: r.nonce.toString(), expiresAtSec: r.expiresAtSec, lastError: r.lastError, fireTx: r.fireTx,
    proceedsBase: text(r.proceedsBase), contractsRaw: text(r.contractsRaw), firedAtMs: r.firedAtMs, updatedAtMs: r.updatedAtMs,
  };
}
export type PublicExitRow = ReturnType<typeof publicExitRow>;
