/** `indexer_recounts` (migrations/index): one row per event per recount run. */
import type { Sql } from "./index";

export interface RecountInsert {
  chainId: number;
  via: string;
  area: string;
  contract: string;
  address: string;
  event: string;
  topic0: string;
  fromBlock: bigint;
  toBlock: bigint;
  indexerCount: bigint;
  localCount: bigint;
  localSource: string;
  match: boolean;
}

export async function insertRecounts(sql: Sql, rows: readonly RecountInsert[]): Promise<number> {
  if (!rows.length) return 0;
  const values = rows.map((r) => ({
    chain_id: r.chainId, via: r.via, area: r.area, contract: r.contract, address: r.address.toLowerCase(), event: r.event, topic0: r.topic0.toLowerCase(),
    from_block: r.fromBlock.toString(), to_block: r.toBlock.toString(), indexer_count: r.indexerCount.toString(), local_count: r.localCount.toString(),
    local_source: r.localSource, match: r.match,
  }));
  const inserted = await sql`insert into indexer_recounts ${sql(values)} returning id`;
  return inserted.length;
}
