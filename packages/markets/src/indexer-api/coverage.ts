/**
 * What the index holds (R6, D-230): the block gaps in its `blocks` table from a start block to its head, in two
 * read-only queries plus a page per 5,000 gaps. The old recount compared a contract only when the index held every
 * block from deploy to head, so one skipped block (the hosted index misses ~1% of recent Moderato blocks) left every
 * contract "not yet covered". Now the recount compares the segments between the gaps and reports the gaps.
 *
 * The SQL is portable between the indexer's PostgreSQL and ClickHouse tiers (`lead()` over the distinct block numbers,
 * aliased subqueries); `blocks` may hold a block twice (seen in the archive: 23,796 duplicate rows in 26M–27M), so the
 * walk is over `DISTINCT num`. Pages use an explicit `LIMIT` under the server's silent 10,000-row cap.
 */
import type { IndexerClient } from "./client";
import type { BlockRange } from "./ranges";

export interface IndexCoverage {
  /** The highest block the index holds at or after `from`; null when it holds none. */
  head: bigint | null;
  /** The blocks in `[from, head]` the index lacks, sorted and disjoint. */
  gaps: BlockRange[];
}

export const GAP_PAGE = 5_000;

const big = (v: unknown): bigint | null => (v === null || v === undefined || v === "" ? null : BigInt(String(v)));

/** The interior gaps among the distinct blocks in `[from, to]`, first `limit` of them. */
export const gapsSql = (from: bigint, to: bigint, limit = GAP_PAGE): string =>
  `SELECT g.num + 1 AS gap_from, g.nxt - 1 AS gap_to FROM (SELECT d.num, lead(d.num) OVER (ORDER BY d.num) AS nxt FROM (SELECT DISTINCT num FROM blocks WHERE num >= ${from} AND num <= ${to}) AS d) AS g WHERE g.nxt > g.num + 1 ORDER BY gap_from LIMIT ${limit}`;

export const spanSql = (from: bigint): string => `SELECT min(num) AS lo, max(num) AS hi FROM blocks WHERE num >= ${from}`;

export async function indexerCoverage(client: IndexerClient, from: bigint): Promise<IndexCoverage> {
  const engine = client.archiveEngine ? { engine: client.archiveEngine } : {};
  const span = (await client.query({ sql: spanSql(from), ...engine })).rows[0];
  const lo = big(span?.lo);
  const head = big(span?.hi);
  if (lo === null || head === null) return { head: null, gaps: [] };
  const gaps: BlockRange[] = lo > from ? [{ from, to: lo - 1n }] : [];
  // The scan starts at a held block each page (`lo`, then the block after the last gap), so every gap is interior.
  for (let cursor = lo; ; ) {
    const { rows } = await client.query({ sql: gapsSql(cursor, head), ...engine });
    for (const row of rows) {
      const gapFrom = big(row.gap_from);
      const gapTo = big(row.gap_to);
      if (gapFrom === null || gapTo === null || gapTo < gapFrom) throw new Error(`indexer answered a malformed gap: ${JSON.stringify(row)}`);
      gaps.push({ from: gapFrom, to: gapTo });
    }
    if (rows.length < GAP_PAGE) break;
    cursor = gaps[gaps.length - 1]!.to + 1n;
  }
  return { head, gaps };
}
