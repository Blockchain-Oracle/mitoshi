/**
 * The indexer's launchpad sources (index/0010; R6 money S02 + S08, D-230): the CurveLaunchpad and the LaunchRegistry on
 * their own cursors (`sourceFollower`), then two followers over sets that grow — every launched token's Transfers and
 * every graduated pool's Swaps — whose cursors never pass the launchpad's and the registry's, so a token created in a
 * window is known before its first transfer is read. A follower that has nothing to follow still advances its cursor
 * (one empty window, no request). Same writer, same window sizing and shrink on "Request exceeds defined limit", same
 * bus: every launch event goes to `launch:<token>` and `launches` (`window.ts`).
 */
import type { Sql } from "@cwf/db";
import type { IndexWriter, IdxEvent } from "@cwf/db/idx";
import { fetchLaunchpadEvents, fetchLaunchTransfers, fetchPoolSwaps, launchCursorKeys, launchOpsVenueOf, registryFetcher, type ChainEvent, type OpsClient } from "@cwf/markets/ops";
import type { VenueDeps } from "../../runtime";
import { sourceFollower, type SourceFollower } from "./follower";
import { grow, nextRange, shrink, topicsOf, type WindowState } from "./window";

const toIdx = (e: ChainEvent): IdxEvent => ({ ...e, address: e.address.toLowerCase(), market: null });

export { launchCursorKeys };

interface SetSource {
  label: string;
  key: string;
  fromBlock: bigint;
  /** The highest block this follower may read to: the cursors it must not pass. */
  bound: () => Promise<number>;
  /** One window's events; an empty set reads nothing. */
  fetch: (from: bigint, to: bigint) => Promise<ChainEvent[]>;
}

function setFollower(deps: Pick<VenueDeps, "bus">, client: OpsClient, writer: IndexWriter, source: SetSource): SourceFollower {
  const state: WindowState = { size: 100_000 };
  const stats: SourceFollower["stats"] = { windows: 0, inserted: 0, errors: 0, cursor: null };
  return {
    stats,
    async pass(head) {
      const cursor = (await writer.cursor(client.chainId, source.key)) ?? Number(source.fromBlock) - 1;
      stats.cursor = cursor;
      const range = nextRange(cursor, Math.min(head, await source.bound()), state);
      if (!range) return `${source.label} caught up at ${cursor}`;
      let events: ChainEvent[];
      try {
        events = await source.fetch(BigInt(range.from), BigInt(range.to));
        grow(state);
      } catch (error) {
        shrink(state);
        stats.errors++;
        throw error;
      }
      const result = await writer.writeWindow(events.map(toIdx), { chainId: client.chainId, address: source.key, block: range.to });
      stats.windows++;
      stats.inserted += result.inserted;
      stats.cursor = range.to;
      for (const e of result.newEvents) for (const topic of topicsOf(e)) deps.bus.publish(topic, e.name, { ...e.data, txHash: e.txHash, logIndex: e.logIndex, blockTimeSec: e.blockTimeSec });
      return `${source.label} ${range.live ? "live" : "backfill"} ${range.from}..${range.to} (+${result.inserted})`;
    },
  };
}

export function launchFollowers(deps: Pick<VenueDeps, "bus" | "sql">, client: OpsClient, writer: IndexWriter): SourceFollower[] {
  const v = launchOpsVenueOf(client.chainId);
  if (!v || !deps.sql) return [];
  const sql: Sql = deps.sql;
  const keys = launchCursorKeys(v);
  const cursorOf = async (address: string) => (await writer.cursor(client.chainId, address)) ?? 0;
  const contracts = async () => Math.min(await cursorOf(v.launchpad), await cursorOf(v.registry));
  const tokens = async () => (await sql<{ token: `0x${string}` }[]>`select token from idx_launches`).map((r) => r.token);
  const pools = async () => (await sql<{ token: `0x${string}`; pool_id: `0x${string}` }[]>`select token, pool_id from idx_launches where pool_id is not null`).map((r) => ({ id: r.pool_id, token: r.token }));
  return [
    sourceFollower(deps, client, writer, { label: "launchpad", address: v.launchpad, fromBlock: v.launchpadBlock, fetch: fetchLaunchpadEvents }),
    sourceFollower(deps, client, writer, { label: "registry", address: v.registry, fromBlock: v.registryBlock, fetch: registryFetcher(v.launchpad) }),
    setFollower(deps, client, writer, { label: "launch-transfers", key: keys.transfers, fromBlock: v.registryBlock < v.launchpadBlock ? v.registryBlock : v.launchpadBlock, bound: contracts, fetch: async (from, to) => fetchLaunchTransfers(client, await tokens(), from, to) }),
    setFollower(deps, client, writer, { label: "launch-swaps", key: keys.swaps, fromBlock: v.launchpadBlock, bound: () => cursorOf(v.launchpad), fetch: async (from, to) => fetchPoolSwaps(client, v.poolManager, await pools(), from, to) }),
  ];
}
