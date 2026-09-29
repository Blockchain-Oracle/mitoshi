/**
 * The sponsorship ledger (plan C.3.3; `relay_sponsorships`, Agari's Postgres ledger replacing Masayume's in-process
 * counters, which break across instances). The store is injected: `@cwf/db` implements it over Postgres; tests use
 * the memory store. Rows are written only when the relay actually co-signs a raw transaction.
 */
import type { Address, Hex } from "viem";

export interface SponsorshipRow {
  chainId: number;
  area: string;
  sender: Address;
  device: string | null;
  method: string;
  feeMicros: bigint;
  /** Hash of the co-signed transaction when the relay broadcast it; null for sign-only. */
  txHash: Hex | null;
  createdAtSec: number;
}

export interface LedgerWindow {
  sinceSec: number;
  sender?: Address;
  device?: string;
}

export interface LedgerTotals {
  count: number;
  feeMicros: bigint;
}

export interface LedgerStore {
  record(row: SponsorshipRow): Promise<void>;
  totals(window: LedgerWindow): Promise<LedgerTotals>;
}

/** Process-local ledger for tests and single-process scripts. */
export function createMemoryLedger(): LedgerStore & { rows: SponsorshipRow[] } {
  const rows: SponsorshipRow[] = [];
  return {
    rows,
    async record(row) {
      rows.push(row);
    },
    async totals(window) {
      const hit = rows.filter(
        (r) => r.createdAtSec >= window.sinceSec && (!window.sender || r.sender.toLowerCase() === window.sender.toLowerCase()) && (!window.device || r.device === window.device),
      );
      return { count: hit.length, feeMicros: hit.reduce((s, r) => s + r.feeMicros, 0n) };
    },
  };
}
