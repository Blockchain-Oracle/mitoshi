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

/**
 * Each row's asset, from the indexer's Window table (the same registry symbol the keeper names in its `exit` event), so
 * a sale the terminal missed can still say "· BTC". Lower-case market ids, one indexed lookup; an index that can't be
 * read answers nothing rather than failing the list.
 */
export async function exitSymbols(markets: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(markets.map((m) => m.toLowerCase()))];
  if (ids.length === 0) return new Map();
  const rows = await db()<{ market: string; symbol: string | null }[]>`select market, symbol from idx_markets where market = any(${ids}::text[])`.catch(() => []);
  return new Map(rows.filter((r) => r.symbol).map((r) => [r.market.toLowerCase(), r.symbol!]));
}
