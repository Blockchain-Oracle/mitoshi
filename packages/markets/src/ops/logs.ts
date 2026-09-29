/**
 * The indexer's chain side (plan C.4.1 `fetch.ts` + `decode.ts`): one `eth_getLogs` per window for the engine address,
 * decoded against the generated ABI into JSON-safe rows (bigints as decimal strings). Tempo finalizes every block, so
 * the follower reads to `latest` with no reorg handling (D-030). Replaces Agari 03b30ab:packages/markets/src/ops/
 * indexer.ts (Solana signature walk + emit_cpi decode).
 */
import { decodeEventLog, type Address, type Hex, type Log } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import type { OpsClient } from "./client";

export interface ChainEvent {
  chainId: number;
  address: Address;
  txHash: Hex;
  logIndex: number;
  blockNumber: number;
  blockTimeSec: number;
  name: string;
  /** Indexed `marketId` for market-scoped events; null otherwise. */
  market: Hex | null;
  /** The per-market `seq` stamped on every event of one call; null for engine-wide events. */
  seq: string | null;
  data: Record<string, unknown>;
}

/** Bigints → decimal strings, recursively (JSONB-safe; never floats). */
export function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]));
  return value;
}

/** Decodes one engine log; null for a log that is not an engine event. */
export function decodeEngineLog(chainId: number, log: Log, blockTimeSec: number): ChainEvent | null {
  try {
    const decoded = decodeEventLog({ abi: eventsEngineAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    const args = (decoded.args ?? {}) as Record<string, unknown>;
    const market = typeof args.marketId === "string" ? (args.marketId as Hex) : null;
    const seq = args.seq === undefined ? null : String(args.seq);
    return {
      chainId,
      address: log.address,
      txHash: log.transactionHash!,
      logIndex: Number(log.logIndex),
      blockNumber: Number(log.blockNumber),
      blockTimeSec,
      name: decoded.eventName as string,
      market,
      seq,
      data: jsonSafe(args) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/** Logs of `address` in `[fromBlock, toBlock]`, decoded, with block times (from the log when the node sends it). */
export async function fetchEngineEvents(client: OpsClient, address: Address, fromBlock: bigint, toBlock: bigint): Promise<ChainEvent[]> {
  const logs = await client.public.getLogs({ address, fromBlock, toBlock });
  const times = new Map<bigint, number>();
  for (const log of logs) {
    const stamped = (log as { blockTimestamp?: bigint | Hex | null }).blockTimestamp;
    if (stamped !== undefined && stamped !== null) times.set(log.blockNumber!, Number(stamped));
  }
  const missing = [...new Set(logs.map((l) => l.blockNumber!).filter((b) => !times.has(b)))];
  const blocks = await Promise.all(missing.map((b) => client.public.getBlock({ blockNumber: b })));
  for (const b of blocks) times.set(b.number!, Number(b.timestamp));
  const out: ChainEvent[] = [];
  for (const log of logs) {
    const e = decodeEngineLog(client.chainId, log, times.get(log.blockNumber!) ?? 0);
    if (e) out.push(e);
  }
  return out;
}

export async function headBlock(client: OpsClient): Promise<bigint> {
  return client.public.getBlockNumber({ cacheTime: 0 });
}
