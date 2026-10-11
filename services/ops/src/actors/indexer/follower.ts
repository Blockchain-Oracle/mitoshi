/**
 * One extra source for the indexer (plan C.4.1 `sources.ts`): a contract with its own cursor, window sizing and one
 * `eth_getLogs` per window, written through the same idempotent writer (`idx_events` insert-once → its projections).
 * These events carry no engine `seq` and are stored without a `market`, so a Window rebuild never replays them. Applied
 * events go to their topics (`user:<addr>` etc., `window.ts`). The vault (S7), the strategy registry and ERC-8004
 * feedback (S9) are each one.
 */
import type { IndexWriter, IdxEvent } from "@cwf/db/idx";
import type { ChainEvent, OpsClient } from "@cwf/markets/ops";
import type { VenueDeps } from "../../runtime";
import { grow, nextRange, shrink, topicsOf, type WindowState } from "./window";

const toIdx = (e: ChainEvent): IdxEvent => ({ ...e, address: e.address.toLowerCase(), market: null });

export interface SourceFollower {
  stats: { windows: number; inserted: number; errors: number; cursor: number | null };
  /** One window toward `head`; its line for the heartbeat. Throws on a provider error (the window shrinks). */
  pass(head: number): Promise<string>;
}

export interface Source {
  /** The heartbeat's word for it ("vault", "strategies", "feedback"). */
  label: string;
  address: `0x${string}`;
  fromBlock: bigint;
  fetch(client: OpsClient, address: `0x${string}`, fromBlock: bigint, toBlock: bigint): Promise<ChainEvent[]>;
}

export function sourceFollower(deps: Pick<VenueDeps, "bus">, client: OpsClient, writer: IndexWriter, source: Source): SourceFollower {
  const state: WindowState = { size: 100_000 };
  const stats: SourceFollower["stats"] = { windows: 0, inserted: 0, errors: 0, cursor: null };
  const tag = `${source.label} ${source.address.slice(0, 8)}`;
  return {
    stats,
    async pass(head) {
      const cursor = (await writer.cursor(client.chainId, source.address)) ?? Number(source.fromBlock) - 1;
      stats.cursor = cursor;
      const range = nextRange(cursor, head, state);
      if (!range) return `${tag} caught up at ${cursor}`;
      let events: ChainEvent[];
      try {
        events = await source.fetch(client, source.address, BigInt(range.from), BigInt(range.to));
        grow(state);
      } catch (error) {
        shrink(state);
        stats.errors++;
        throw error;
      }
      const result = await writer.writeWindow(events.map(toIdx), { chainId: client.chainId, address: source.address, block: range.to });
      stats.windows++;
      stats.inserted += result.inserted;
      stats.cursor = range.to;
      for (const e of result.newEvents) for (const topic of topicsOf(e)) deps.bus.publish(topic, e.name, { ...e.data, market: typeof e.data.marketId === "string" ? e.data.marketId : null, txHash: e.txHash, logIndex: e.logIndex, blockTimeSec: e.blockTimeSec });
      return `${tag} ${range.live ? "live" : "backfill"} ${range.from}..${range.to} (+${result.inserted})`;
    },
  };
}
