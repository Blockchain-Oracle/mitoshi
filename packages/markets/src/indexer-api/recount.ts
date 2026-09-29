/**
 * The hourly recount (plan C.4.3): for every event of every deployed contract (the generated `indexerSources`), count
 * its logs in the Tempo Indexer API / tidx and in our own record, over the same closed block range, and report any
 * difference. "Our own record" is pluggable (`LocalCounter`): the chain itself (`rpcLogCounter`, windowed
 * `eth_getLogs`) from the first deploy; the S3 follower adds an `idx_events` counter when it creates that table.
 */
import { getAddress, type Address, type Hex, type PublicClient } from "viem";
import { indexerCovers, indexerHead, type IndexerClient } from "./client";

export interface RecountSource {
  area: string;
  contract: string;
  address: string;
  deployBlock: number | null;
  events: readonly { name: string; signature: string; topic0: string }[];
}

export type LocalCounter = (q: { address: Address; topic0: Hex; fromBlock: bigint; toBlock: bigint }) => Promise<{ count: bigint; source: string }>;

export interface RecountRow {
  chainId: number;
  area: string;
  contract: string;
  address: Address;
  event: string;
  topic0: Hex;
  fromBlock: bigint;
  toBlock: bigint;
  indexerCount: bigint;
  localCount: bigint;
  localSource: string;
  match: boolean;
}

export interface RecountResult {
  toBlock: bigint;
  via: string;
  rows: RecountRow[];
  mismatches: RecountRow[];
  /** Sources the indexer does not fully cover yet (a backfilling self-hosted tidx); reported, not compared. */
  uncovered: { contract: string; fromBlock: bigint; toBlock: bigint }[];
}

/** Hex for SQL: tidx compares BYTEA columns against `'0x…'` literals (tidx README "Event Tables"). */
const bytea = (hex: string) => `'${hex.toLowerCase()}'`;

/** One event's count in the indexer over `[from, to]` for one address (raw `logs` table; no decoding needed). */
export async function indexerEventCount(client: IndexerClient, address: Address, topic0: Hex, fromBlock: bigint, toBlock: bigint): Promise<bigint> {
  const { rows } = await client.query({
    sql: `SELECT count(*) AS n FROM logs WHERE address = ${bytea(address)} AND selector = ${bytea(topic0)} AND block_num >= ${fromBlock} AND block_num <= ${toBlock}`,
  });
  return BigInt(String(rows[0]?.n ?? 0));
}

/** `eth_getLogs` count over `[from, to]`, in windows that halve on a provider error. */
export function rpcLogCounter(client: PublicClient, windowBlocks = 10_000n): LocalCounter {
  return async ({ address, topic0, fromBlock, toBlock }) => {
    let count = 0n;
    let from = fromBlock;
    let window = windowBlocks;
    while (from <= toBlock) {
      const to = from + window - 1n > toBlock ? toBlock : from + window - 1n;
      try {
        // Raw `eth_getLogs`: viem's `getLogs` filters by a parsed `event`, not by a bare topic0.
        const logs = (await client.request({
          method: "eth_getLogs",
          params: [{ address, topics: [topic0], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }],
        } as never)) as unknown[];
        count += BigInt(logs.length);
        from = to + 1n;
      } catch (error) {
        if (window <= 100n) throw error;
        window /= 2n;
      }
    }
    return { count, source: "rpc" };
  };
}

export interface RecountInput {
  chainId: number;
  indexer: IndexerClient;
  sources: readonly RecountSource[];
  local: LocalCounter;
  /** Upper bound; the recount uses min(this, the indexer's head) minus `confirmations`. */
  headBlock: bigint;
  confirmations?: bigint;
  /** Start no earlier than this block (default: each contract's deploy block). */
  fromBlockFloor?: bigint;
}

export async function recount(input: RecountInput): Promise<RecountResult> {
  const indexed = await indexerHead(input.indexer);
  const top = (indexed < input.headBlock ? indexed : input.headBlock) - (input.confirmations ?? 2n);
  const rows: RecountRow[] = [];
  const uncovered: RecountResult["uncovered"] = [];
  for (const src of input.sources) {
    const deployed = BigInt(src.deployBlock ?? 0);
    const fromBlock = input.fromBlockFloor !== undefined && input.fromBlockFloor > deployed ? input.fromBlockFloor : deployed;
    if (fromBlock > top) continue;
    if (!(await indexerCovers(input.indexer, fromBlock, top))) {
      uncovered.push({ contract: src.contract, fromBlock, toBlock: top });
      continue;
    }
    const address = getAddress(src.address);
    for (const ev of src.events) {
      const topic0 = ev.topic0 as Hex;
      const [indexerCount, local] = await Promise.all([
        indexerEventCount(input.indexer, address, topic0, fromBlock, top),
        input.local({ address, topic0, fromBlock, toBlock: top }),
      ]);
      rows.push({ chainId: input.chainId, area: src.area, contract: src.contract, address, event: ev.name, topic0, fromBlock, toBlock: top, indexerCount, localCount: local.count, localSource: local.source, match: indexerCount === local.count });
    }
  }
  return { toBlock: top, via: input.indexer.via, rows, mismatches: rows.filter((r) => !r.match), uncovered };
}
