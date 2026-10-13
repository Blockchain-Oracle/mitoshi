/**
 * The recount (plan C.4.3; R6, D-230): for every deployed contract (the generated `indexerSources`), the logs the
 * Tempo Indexer API / tidx holds against the chain's own `eth_getLogs`, per contract and topic0, over the blocks the
 * index holds. Tile by tile (`./plan`): a pass compares what is new since the last one, under a time budget, and each
 * compared item is committed as it lands, so a pass cut short by the budget or the key's rate limit loses nothing.
 *
 * Both sides count over identical block sets: the indexer with an explicit range predicate (never "whatever it has"),
 * the chain by dropping logs in blocks the index lacks. One `eth_getLogs` walk per item covers all its contracts
 * (address array) and every topic, so a library's events emitted under the engine's address are compared too.
 */
import { getAddress, type Address, type PublicClient } from "viem";
import { walkLogWindows, type LogWalkOptions } from "../ops/log-walk";
import { indexerHead, type IndexerClient } from "./client";
import { indexerCoverage } from "./coverage";
import { IndexerRateLimitError } from "./pacer";
import { applyItem, comparedBlocks, DEFAULT_TILE_BLOCKS, domainStart, planRecount, type RecountItem, type TileState } from "./plan";
import { blockCount, chunkRanges, clipRanges, inRanges, walkSpans, type BlockRange } from "./ranges";

export interface RecountSource {
  area: string;
  contract: string;
  address: string;
  deployBlock: number | null;
  events: readonly { name: string; signature: string; topic0: string }[];
}

/** Counts per lowercased address, then per lowercased topic0. */
export type LogCounts = Map<string, Map<string, bigint>>;

/** One chain log, as much of it as the recount reads. */
export interface ChainLog {
  blockNumber: bigint;
  address: string;
  topic0: string | null;
}

/** Calls `onLogs` with every log of `addresses` in `[from, to]`. */
export type ChainLogWalk = (addresses: readonly Address[], fromBlock: bigint, toBlock: bigint, onLogs: (logs: ChainLog[]) => void) => Promise<void>;

export interface RecountRow {
  chainId: number;
  kind: RecountItem["kind"];
  area: string;
  contract: string;
  address: Address;
  event: string;
  topic0: string;
  fromBlock: bigint;
  toBlock: bigint;
  /** Blocks counted (held by the index) and skipped (the index lacked them) in `[fromBlock, toBlock]`. */
  heldBlocks: bigint;
  gapBlocks: bigint;
  indexerCount: bigint;
  localCount: bigint;
  localSource: string;
  match: boolean;
}

const bump = (counts: LogCounts, address: string, topic0: string, n: bigint) => {
  let byTopic = counts.get(address);
  if (!byTopic) counts.set(address, (byTopic = new Map()));
  byTopic.set(topic0, (byTopic.get(topic0) ?? 0n) + n);
};

/** Hex for SQL: tidx compares BYTEA columns against `'0x…'` literals (tidx README "Event Tables"). */
const bytea = (hex: string) => `'${hex.toLowerCase()}'`;
export const RANGES_PER_QUERY = 40;

export const logCountsSql = (addresses: readonly string[], segments: readonly BlockRange[]): string =>
  `SELECT address, selector, count(*) AS n FROM logs WHERE (${addresses.map((a) => `address = ${bytea(a)}`).join(" OR ")}) AND (${segments.map((s) => `(block_num >= ${s.from} AND block_num <= ${s.to})`).join(" OR ")}) GROUP BY address, selector`;

/** The index's logs per contract and topic0 over exactly `segments`. */
export async function indexerLogCounts(client: IndexerClient, addresses: readonly string[], segments: readonly BlockRange[]): Promise<LogCounts> {
  const counts: LogCounts = new Map();
  if (!addresses.length) return counts;
  for (const chunk of chunkRanges(segments, RANGES_PER_QUERY)) {
    const { rows } = await client.query({ sql: logCountsSql(addresses, chunk), ...(client.archiveEngine ? { engine: client.archiveEngine } : {}) });
    for (const row of rows) bump(counts, String(row.address).toLowerCase(), String(row.selector ?? "").toLowerCase(), BigInt(String(row.n ?? 0)));
  }
  return counts;
}

/** Two segments closer than this share one walk (a gap of a few blocks isn't worth a second request). */
const WALK_JOIN_BLOCKS = 10_000n;

/** The chain's logs per contract and topic0 over exactly `segments`: logs in blocks between segments are dropped. */
export async function chainLogCounts(walk: ChainLogWalk, addresses: readonly string[], segments: readonly BlockRange[]): Promise<{ counts: LogCounts; logs: bigint }> {
  const counts: LogCounts = new Map();
  let logs = 0n;
  if (!addresses.length) return { counts, logs };
  const checksummed = addresses.map((a) => getAddress(a));
  for (const span of walkSpans(segments, WALK_JOIN_BLOCKS)) {
    await walk(checksummed, span.from, span.to, (found) => {
      for (const log of found) {
        if (!inRanges(segments, log.blockNumber)) continue;
        logs++;
        bump(counts, log.address.toLowerCase(), (log.topic0 ?? "").toLowerCase(), 1n);
      }
    });
  }
  return { counts, logs };
}

/** `eth_getLogs` for an address array, in windows the RPC accepts (`walkLogWindows`: hints, halving, retries). */
export function rpcLogWalk(client: PublicClient, options: LogWalkOptions = {}): ChainLogWalk {
  const hex = (n: bigint) => `0x${n.toString(16)}`;
  return async (addresses, fromBlock, toBlock, onLogs) => {
    await walkLogWindows(
      fromBlock,
      toBlock,
      async (from, to) => {
        // Raw `eth_getLogs`: viem's `getLogs` wants a parsed event to filter on; here every topic counts.
        const found = (await client.request({ method: "eth_getLogs", params: [{ address: [...addresses], fromBlock: hex(from), toBlock: hex(to) }] } as never)) as { blockNumber: string; address: string; topics: string[] }[];
        onLogs(found.map((l) => ({ blockNumber: BigInt(l.blockNumber), address: l.address, topic0: l.topics[0] ?? null })));
      },
      options,
    );
  };
}

export interface RecountPassInput {
  chainId: number;
  indexer: IndexerClient;
  sources: readonly RecountSource[];
  walk: ChainLogWalk;
  /** The chain's head (RPC). */
  headBlock: bigint;
  /** What earlier passes compared (persisted by the caller). */
  tiles: readonly TileState[];
  /** Persists one compared item: its rows always, and the tile's new state when the counts matched (else null). */
  commit: (result: { tile: TileState | null; rows: RecountRow[] }) => Promise<void>;
  /** Blocks kept below both heads, for writes still landing (default 64, ~40 s of Moderato). */
  confirmations?: bigint;
  tileBlocks?: bigint;
  /** No new item starts after this long (default 4 min; ops exits on a pass stuck for 10). */
  budgetMs?: number;
  now?: () => number;
}

export interface RecountPassResult {
  via: string;
  /** The last block compared this pass, or would have been. */
  toBlock: bigint;
  /** The first block any contract can have logs at. */
  fromBlock: bigint | null;
  rows: RecountRow[];
  mismatches: RecountRow[];
  items: { done: number; left: number };
  /** Logs counted on the chain side this pass. */
  logs: bigint;
  /** Blocks compared so far over `[fromBlock, toBlock]`, of how many. */
  compared: { blocks: bigint; of: bigint };
  /** The index's gaps in `[fromBlock, toBlock]` now. */
  gaps: BlockRange[];
  /** Why the pass stopped early, with the wait the key asked for. */
  stopped: { by: "budget" } | { by: "rate-limit"; retryAfterMs: number } | null;
}

const LOCAL_SOURCE = "rpc";

/** Names a topic0: the contract's own event, else any manifest event with that topic (a library's), else the hash. */
function namer(sources: readonly RecountSource[]) {
  const byAddress = new Map(sources.map((s) => [s.address.toLowerCase(), s]));
  const anywhere = new Map<string, string>();
  for (const s of sources) for (const e of s.events) if (!anywhere.has(e.topic0.toLowerCase())) anywhere.set(e.topic0.toLowerCase(), e.name);
  return (address: string, topic0: string) => byAddress.get(address)?.events.find((e) => e.topic0.toLowerCase() === topic0)?.name ?? anywhere.get(topic0) ?? (topic0 ? `topic ${topic0.slice(0, 10)}` : "anonymous");
}

function rowsOf(chainId: number, item: RecountItem, sources: readonly RecountSource[], indexer: LogCounts, chain: LogCounts): RecountRow[] {
  const name = namer(sources);
  const byAddress = new Map(sources.map((s) => [s.address.toLowerCase(), s]));
  const heldBlocks = blockCount(item.segments);
  const gapBlocks = blockCount(item.skipped);
  const rows: RecountRow[] = [];
  for (const address of item.addresses) {
    const topics = new Set([...(indexer.get(address)?.keys() ?? []), ...(chain.get(address)?.keys() ?? [])]);
    const src = byAddress.get(address);
    for (const topic0 of [...topics].sort()) {
      const indexerCount = indexer.get(address)?.get(topic0) ?? 0n;
      const localCount = chain.get(address)?.get(topic0) ?? 0n;
      rows.push({ chainId, kind: item.kind, area: src?.area ?? "?", contract: src?.contract ?? address, address: getAddress(address), event: name(address, topic0), topic0, fromBlock: item.from, toBlock: item.to, heldBlocks, gapBlocks, indexerCount, localCount, localSource: LOCAL_SOURCE, match: indexerCount === localCount });
    }
  }
  return rows;
}

export async function recountPass(input: RecountPassInput): Promise<RecountPassResult> {
  const now = input.now ?? Date.now;
  const startedMs = now();
  const sources = input.sources.filter((s) => s.deployBlock !== null);
  const planSources = sources.map((s) => ({ address: s.address, deployBlock: BigInt(s.deployBlock!) }));
  const fromBlock = domainStart(planSources);
  const tiles = new Map(input.tiles.map((t) => [t.tileFrom, t]));
  const result: RecountPassResult = { via: input.indexer.via, toBlock: 0n, fromBlock, rows: [], mismatches: [], items: { done: 0, left: 0 }, logs: 0n, compared: { blocks: 0n, of: 0n }, gaps: [], stopped: null };
  const summarize = () => {
    result.mismatches = result.rows.filter((r) => !r.match);
    if (fromBlock !== null && result.toBlock >= fromBlock) {
      result.compared = { blocks: comparedBlocks([...tiles.values()].map((t) => ({ ...t, ...clipTile(t, fromBlock, result.toBlock) }))), of: result.toBlock - fromBlock + 1n };
    }
    return result;
  };
  if (fromBlock === null) return result;
  try {
    const indexed = await indexerHead(input.indexer);
    const top = (indexed < input.headBlock ? indexed : input.headBlock) - (input.confirmations ?? 64n);
    result.toBlock = top;
    if (top < fromBlock) return summarize();
    const coverage = await indexerCoverage(input.indexer, fromBlock);
    result.gaps = clipRanges(coverage.gaps, fromBlock, top);
    const items = planRecount({ sources: planSources, top, tileBlocks: input.tileBlocks ?? DEFAULT_TILE_BLOCKS, tiles: [...tiles.values()], gaps: result.gaps });
    result.items.left = items.length;
    for (const item of items) {
      if (now() - startedMs > (input.budgetMs ?? 4 * 60_000)) {
        result.stopped = { by: "budget" };
        break;
      }
      const indexerCounts = await indexerLogCounts(input.indexer, item.addresses, item.segments);
      const chain = await chainLogCounts(input.walk, item.addresses, item.segments);
      const rows = rowsOf(input.chainId, item, sources, indexerCounts, chain.counts);
      const matched = rows.every((r) => r.match);
      const next = matched ? applyItem(tiles.get(item.tileFrom), item) : null;
      await input.commit({ tile: next, rows });
      if (next) tiles.set(item.tileFrom, next);
      result.rows.push(...rows);
      result.logs += chain.logs;
      result.items.done++;
      result.items.left--;
    }
  } catch (error) {
    if (!(error instanceof IndexerRateLimitError)) throw error;
    result.stopped = { by: "rate-limit", retryAfterMs: error.retryAfterMs };
  }
  return summarize();
}

/** A tile's compared range and gaps, clipped to `[from, to]` (a tile compared past a lowered top still counts once). */
function clipTile(t: TileState, from: bigint, to: bigint): Pick<TileState, "from" | "to" | "gaps"> {
  const lo = t.from > from ? t.from : from;
  const hi = t.to < to ? t.to : to;
  return hi < lo ? { from: 1n, to: 0n, gaps: [] } : { from: lo, to: hi, gaps: clipRanges(t.gaps, lo, hi) };
}
