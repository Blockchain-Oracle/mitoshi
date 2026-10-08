/**
 * The indexer's second source (plan C.4.1 `sources.ts`; S7): the EventVault, with its own cursor, window sizing and
 * one `eth_getLogs` per window, written through the same idempotent writer (`idx_events` insert-once → the vault's
 * projections, index/0002). Vault events carry no engine `seq` and are stored without a `market`, so a Window rebuild
 * never replays them. Applied events go to the owner's `user:` topic (the web refreshes its Trading Balance).
 */
import type { IndexWriter, IdxEvent } from "@cwf/db/idx";
import { fetchVaultEvents, vaultVenuesOf, type ChainEvent, type OpsClient, type VaultVenue } from "@cwf/markets/ops";
import type { VenueDeps } from "../../runtime";
import { grow, nextRange, shrink, topicsOf, type WindowState } from "./window";

const toIdx = (e: ChainEvent): IdxEvent => ({ ...e, address: e.address.toLowerCase(), market: null });

export interface VaultFollower {
  stats: { windows: number; inserted: number; errors: number; cursor: number | null };
  /** One window toward `head`; its line for the heartbeat. Throws on a provider error (the window shrinks). */
  pass(head: number): Promise<string>;
}

/** One follower per Trading Balance on the chain (S24.2: v2, then v1), each with its own cursor. */
export function vaultFollowers(deps: Pick<VenueDeps, "bus">, client: OpsClient, writer: IndexWriter): VaultFollower[] {
  return vaultVenuesOf(client.chainId).map((venue) => vaultFollower(deps, client, writer, venue));
}

export function vaultFollower(deps: Pick<VenueDeps, "bus">, client: OpsClient, writer: IndexWriter, venue: VaultVenue): VaultFollower {
  const state: WindowState = { size: 100_000 };
  const stats: VaultFollower["stats"] = { windows: 0, inserted: 0, errors: 0, cursor: null };
  return {
    stats,
    async pass(head) {
      const cursor = (await writer.cursor(client.chainId, venue.vault)) ?? Number(venue.deployBlock) - 1;
      stats.cursor = cursor;
      const range = nextRange(cursor, head, state);
      if (!range) return `vault ${venue.vault.slice(0, 8)} caught up at ${cursor}`;
      let events: ChainEvent[];
      try {
        events = await fetchVaultEvents(client, venue.vault, BigInt(range.from), BigInt(range.to));
        grow(state);
      } catch (error) {
        shrink(state);
        stats.errors++;
        throw error;
      }
      const result = await writer.writeWindow(events.map(toIdx), { chainId: client.chainId, address: venue.vault, block: range.to });
      stats.windows++;
      stats.inserted += result.inserted;
      stats.cursor = range.to;
      for (const e of result.newEvents) for (const topic of topicsOf(e)) deps.bus.publish(topic, e.name, { ...e.data, market: typeof e.data.marketId === "string" ? e.data.marketId : null, txHash: e.txHash, logIndex: e.logIndex, blockTimeSec: e.blockTimeSec });
      return `vault ${venue.vault.slice(0, 8)} ${range.live ? "live" : "backfill"} ${range.from}..${range.to} (+${result.inserted})`;
    },
  };
}
