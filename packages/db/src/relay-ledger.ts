/** The relay ledger over Postgres (`relay_sponsorships`), implementing `@cwf/markets/server`'s `LedgerStore`. */
import type { LedgerStore } from "@cwf/markets/server";
import type { Sql } from "./index";

export function createPgLedger(sql: Sql): LedgerStore {
  return {
    async record(row) {
      await sql`insert into relay_sponsorships (chain_id, area, sender, device, method, fee_micros, tx_hash, created_at_sec)
        values (${row.chainId}, ${row.area}, ${row.sender.toLowerCase()}, ${row.device}, ${row.method}, ${row.feeMicros.toString()}, ${row.txHash}, ${row.createdAtSec})`;
    },
    async totals(window) {
      const [r] = await sql<{ count: string; fee: string | null }[]>`
        select count(*)::text as count, coalesce(sum(fee_micros), 0)::text as fee from relay_sponsorships
        where created_at_sec >= ${window.sinceSec}
          ${window.sender ? sql`and lower(sender) = ${window.sender.toLowerCase()}` : sql``}
          ${window.device ? sql`and device = ${window.device}` : sql``}`;
      return { count: Number(r?.count ?? 0), feeMicros: BigInt(r?.fee ?? "0") };
    },
  };
}
