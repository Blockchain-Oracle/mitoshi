/** Wallet transfer scan cursor + transfers over Postgres (`transfer_scans`, `wallet_transfers`), for `/api/activity` (RV-81). */
import type { TokenTransfer } from "@cwf/markets";
import type { Address, Hex } from "@cwf/core";
import type { Sql } from "./index";
import type { ScanRange } from "./keychain-store";

export interface TransferStore {
  range(chainId: number, account: string, token: string): Promise<ScanRange | null>;
  /** Saves transfers and widens the scanned range to include [lo, hi] (the caller scanned it completely). */
  save(chainId: number, account: string, token: string, scanned: ScanRange, transfers: readonly TokenTransfer[], nowMs: number): Promise<void>;
  /** The newest `limit` transfers, oldest first. */
  transfers(chainId: number, account: string, token: string, limit: number): Promise<TokenTransfer[]>;
}

type Row = { block: string; log_index: number; tx_hash: string; at_sec: string | null; from_addr: string; to_addr: string; value: string };

export function createPgTransferStore(sql: Sql): TransferStore {
  return {
    async range(chainId, account, token) {
      const [r] = await sql<{ lo: string; hi: string }[]>`select lo::text, hi::text from transfer_scans where chain_id = ${chainId} and account = ${account.toLowerCase()} and token = ${token.toLowerCase()}`;
      return r ? { lo: BigInt(r.lo), hi: BigInt(r.hi) } : null;
    },
    async save(chainId, account, token, scanned, transfers, nowMs) {
      const acct = account.toLowerCase();
      const tok = token.toLowerCase();
      await sql.begin(async (tx) => {
        for (const t of transfers) {
          await tx`insert into wallet_transfers (chain_id, account, token, block, log_index, tx_hash, at_sec, from_addr, to_addr, value)
            values (${chainId}, ${acct}, ${tok}, ${t.blockNumber.toString()}, ${t.logIndex}, ${t.txHash}, ${t.atSec?.toString() ?? null}, ${t.from.toLowerCase()}, ${t.to.toLowerCase()}, ${t.valueBase.toString()})
            on conflict do nothing`;
        }
        await tx`insert into transfer_scans (chain_id, account, token, lo, hi, updated_at_ms) values (${chainId}, ${acct}, ${tok}, ${scanned.lo.toString()}, ${scanned.hi.toString()}, ${nowMs})
          on conflict (chain_id, account, token) do update set lo = least(transfer_scans.lo, excluded.lo), hi = greatest(transfer_scans.hi, excluded.hi), updated_at_ms = excluded.updated_at_ms`;
      });
    },
    async transfers(chainId, account, token, limit) {
      const rows = await sql<Row[]>`select block::text, log_index, tx_hash, at_sec::text, from_addr, to_addr, value::text from wallet_transfers
        where chain_id = ${chainId} and account = ${account.toLowerCase()} and token = ${token.toLowerCase()} order by block desc, log_index desc limit ${limit}`;
      return rows.reverse().map((r) => ({
        blockNumber: BigInt(r.block), logIndex: r.log_index, txHash: r.tx_hash as Hex, atSec: r.at_sec === null ? null : BigInt(r.at_sec),
        from: r.from_addr as Address, to: r.to_addr as Address, valueBase: BigInt(r.value),
      }));
    },
  };
}
