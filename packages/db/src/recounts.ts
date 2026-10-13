/**
 * The recount's record (migrations/index 0001, 0009): `indexer_recounts`, one row per contract and topic0 per compared
 * item, and `indexer_recount_tiles`, what each 20,000-block tile has compared (R6, D-230). An item's rows and its tile
 * land in one transaction, so a pass cut short never leaves a tile claiming blocks whose counts weren't stored.
 */
import type { BlockRange, RecountRow, TileState } from "@cwf/markets/server";
import type { Sql } from "./index";

export type RecountInsert = Pick<RecountRow, "chainId" | "area" | "contract" | "address" | "event" | "topic0" | "fromBlock" | "toBlock" | "indexerCount" | "localCount" | "localSource" | "match"> &
  Partial<Pick<RecountRow, "kind" | "heldBlocks" | "gapBlocks">> & { via: string };

const values = (rows: readonly RecountInsert[]) =>
  rows.map((r) => ({
    chain_id: r.chainId, via: r.via, kind: r.kind ?? "full", area: r.area, contract: r.contract, address: r.address.toLowerCase(), event: r.event, topic0: r.topic0.toLowerCase(),
    from_block: r.fromBlock.toString(), to_block: r.toBlock.toString(), held_blocks: (r.heldBlocks ?? 0n).toString(), gap_blocks: (r.gapBlocks ?? 0n).toString(),
    indexer_count: r.indexerCount.toString(), local_count: r.localCount.toString(), local_source: r.localSource, match: r.match,
  }));

export async function insertRecounts(sql: Sql, rows: readonly RecountInsert[]): Promise<number> {
  if (!rows.length) return 0;
  const inserted = await sql`insert into indexer_recounts ${sql(values(rows))} returning id`;
  return inserted.length;
}

type TileRow = { tile_from: string; from_block: string; to_block: string; addresses: string[]; gaps: [string, string][] };

const gapsJson = (gaps: readonly BlockRange[]) => gaps.map((g) => [g.from.toString(), g.to.toString()]);

/** Every tile compared on this chain through this indexer route. */
export async function loadRecountTiles(sql: Sql, chainId: number, via: string): Promise<TileState[]> {
  const rows = await sql<TileRow[]>`select tile_from::text, from_block::text, to_block::text, addresses, gaps from indexer_recount_tiles where chain_id = ${chainId} and via = ${via} order by tile_from`;
  return rows.map((r) => ({ tileFrom: BigInt(r.tile_from), from: BigInt(r.from_block), to: BigInt(r.to_block), addresses: r.addresses, gaps: r.gaps.map(([from, to]) => ({ from: BigInt(from), to: BigInt(to) })) }));
}

/** One compared item: its rows, and the tile's new state when its counts matched. */
export async function commitRecount(sql: Sql, input: { chainId: number; via: string; tile: TileState | null; rows: readonly RecountRow[] }): Promise<void> {
  const { chainId, via, tile } = input;
  await sql.begin(async (tx) => {
    if (input.rows.length) await tx`insert into indexer_recounts ${tx(values(input.rows.map((r) => ({ ...r, via }))))}`;
    if (!tile) return;
    await tx`
      insert into indexer_recount_tiles (chain_id, via, tile_from, from_block, to_block, addresses, gaps, updated_at)
      values (${chainId}, ${via}, ${tile.tileFrom.toString()}, ${tile.from.toString()}, ${tile.to.toString()}, ${tile.addresses}, ${tx.json(gapsJson(tile.gaps))}, now())
      on conflict (chain_id, via, tile_from) do update set
        from_block = excluded.from_block, to_block = excluded.to_block, addresses = excluded.addresses, gaps = excluded.gaps, updated_at = now()`;
  });
}
