/** Keychain scan cursor + events over Postgres (`keychain_scans`, `keychain_events`), for `/api/keys` (D-053). */
import type { KeychainEvent, KeychainEventName } from "@cwf/markets";
import type { Address, Hex } from "@cwf/core";
import type { Sql } from "./index";

export interface ScanRange {
  lo: bigint;
  hi: bigint;
}

export interface KeychainStore {
  range(chainId: number, account: string): Promise<ScanRange | null>;
  /** Saves events and widens the scanned range to include [lo, hi] (the caller scanned it completely). */
  save(chainId: number, account: string, scanned: ScanRange, events: readonly KeychainEvent[], nowMs: number): Promise<void>;
  events(chainId: number, account: string): Promise<KeychainEvent[]>;
}

type Row = { block: string; log_index: number; tx_hash: string; name: string; key_id: string; token: string | null; signature_type: number | null; expiry: string | null; limit_value: string | null; amount: string | null };
const big = (v: string | null) => (v === null ? null : BigInt(v));

export function createPgKeychainStore(sql: Sql): KeychainStore {
  return {
    async range(chainId, account) {
      const [r] = await sql<{ lo: string; hi: string }[]>`select lo::text, hi::text from keychain_scans where chain_id = ${chainId} and account = ${account.toLowerCase()}`;
      return r ? { lo: BigInt(r.lo), hi: BigInt(r.hi) } : null;
    },
    async save(chainId, account, scanned, events, nowMs) {
      const acct = account.toLowerCase();
      await sql.begin(async (tx) => {
        for (const e of events) {
          await tx`insert into keychain_events (chain_id, account, block, log_index, tx_hash, name, key_id, token, signature_type, expiry, limit_value, amount)
            values (${chainId}, ${acct}, ${e.blockNumber.toString()}, ${e.logIndex}, ${e.txHash}, ${e.name}, ${e.keyId.toLowerCase()}, ${e.token?.toLowerCase() ?? null},
              ${e.signatureType}, ${e.expirySec?.toString() ?? null}, ${e.limit?.toString() ?? null}, ${e.amount?.toString() ?? null})
            on conflict do nothing`;
        }
        await tx`insert into keychain_scans (chain_id, account, lo, hi, updated_at_ms) values (${chainId}, ${acct}, ${scanned.lo.toString()}, ${scanned.hi.toString()}, ${nowMs})
          on conflict (chain_id, account) do update set lo = least(keychain_scans.lo, excluded.lo), hi = greatest(keychain_scans.hi, excluded.hi), updated_at_ms = excluded.updated_at_ms`;
      });
    },
    async events(chainId, account) {
      const rows = await sql<Row[]>`select block::text, log_index, tx_hash, name, key_id, token, signature_type, expiry::text, limit_value::text, amount::text
        from keychain_events where chain_id = ${chainId} and account = ${account.toLowerCase()} order by block, log_index`;
      return rows.map((r) => ({
        name: r.name as KeychainEventName, blockNumber: BigInt(r.block), logIndex: r.log_index, txHash: r.tx_hash as Hex, keyId: r.key_id as Address,
        token: r.token as Address | null, signatureType: r.signature_type, expirySec: big(r.expiry), limit: big(r.limit_value), amount: big(r.amount),
      }));
    },
  };
}
