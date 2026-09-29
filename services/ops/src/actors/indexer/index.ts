// Ported in role from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/indexer/{index,backfill,subscribe}.ts
// (Solana signature walk + logs subscription → one eth_getLogs follower per source address, D-030).
/**
 * The indexer (plan C.4.1): per source address, a cursor walk of `eth_getLogs` windows from the deploy block to
 * `latest`, each window written in one DB transaction (idempotent), live every second once caught up. After each
 * window it checks `(marketId, seq)` continuity of the Markets it touched; a hole re-fetches that Market's logs by
 * topic and rebuilds its projections. Applied events go to the stream bus (`market:<id>`, `fills`, `prints`,
 * `verdicts`, `markets`, `activity`, `user:<addr>`). Read-only on chain: DRY_RUN changes nothing here.
 */
import { tickerById } from "@cwf/core";
import { indexWriter, indexReader, type IdxEvent } from "@cwf/db/idx";
import { createOpsClient, fetchEngineEvents, headBlock, venueOf, type ChainEvent, type OpsClient, type Venue } from "@cwf/markets/ops";
import { runActor, type PassResult, type VenueDeps } from "../../runtime";
import { BACKFILL_MAX, grow, nextRange, shrink, topicsOf, type WindowState } from "./window";

const LIVE_MS = 1_000;

const toIdx = (e: ChainEvent): IdxEvent => ({ ...e, address: e.address.toLowerCase(), market: e.market?.toLowerCase() ?? null });

export function startIndexer(deps: VenueDeps): { stop: () => void } {
  if (!deps.sql) throw new Error("the indexer needs DATABASE_URL");
  const client: OpsClient = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl });
  const venue: Venue | null = venueOf(client.chainId);
  if (!venue) throw new Error(`no engine fragment for chain ${client.chainId}`);
  const writer = indexWriter(deps.sql);
  const reader = indexReader(deps.sql);
  const state: WindowState = { size: 100_000 };
  const stats = { windows: 0, inserted: 0, rebuilt: 0, gapsRefetched: 0, errors: 0, lagBlocks: 0 };

  /** A `seq` hole: re-read that Market's logs from its first known block (or the deploy block) and rebuild it. */
  const refetchMarket = async (market: string, toBlock: number) => {
    const [row] = await deps.sql!<{ first: string | null }[]>`select min(block_number)::text as first from idx_events where market = ${market}`;
    let from = row?.first ? Number(row.first) : Number(venue.deployBlock);
    const found: ChainEvent[] = [];
    while (from <= toBlock) {
      const to = Math.min(toBlock, from + BACKFILL_MAX - 1);
      found.push(...(await fetchEngineEvents(client, venue.engine, BigInt(from), BigInt(to))).filter((e) => e.market?.toLowerCase() === market));
      from = to + 1;
    }
    const cursor = (await writer.cursor(client.chainId, venue.engine)) ?? toBlock;
    await writer.writeWindow(found.map(toIdx), { chainId: client.chainId, address: venue.engine, block: cursor });
    await writer.rebuildMarkets([market]);
    stats.gapsRefetched++;
  };

  const pass = async (): Promise<PassResult> => {
    const cursor = (await writer.cursor(client.chainId, venue.engine)) ?? Number(venue.deployBlock) - 1;
    const head = Number(await headBlock(client));
    const range = nextRange(cursor, head, state);
    stats.lagBlocks = Math.max(0, head - cursor);
    if (!range) return { why: `caught up at ${cursor}`, detail: { ...stats, cursor, head }, nextDelayMs: LIVE_MS };
    let events: ChainEvent[];
    try {
      events = await fetchEngineEvents(client, venue.engine, BigInt(range.from), BigInt(range.to));
      grow(state);
    } catch (error) {
      shrink(state);
      stats.errors++;
      throw error;
    }
    const series = events.filter((e) => e.name === "SeriesRegistered").map((e) => {
      const d = e.data as Record<string, string | number>;
      return { series: String(d.seriesId), ticker: Number(d.ticker), symbol: tickerById(Number(d.ticker))?.symbol ?? null, cadenceSec: Number(d.cadenceSec), basis: Number(d.basis), lotBase: String(d.lotBase), tickBase: String(d.tickBase), cashUnit: String(d.cashUnit) };
    });
    if (series.length) await writer.upsertSeries(series);
    const result = await writer.writeWindow(events.map(toIdx), { chainId: client.chainId, address: venue.engine, block: range.to });
    stats.windows++;
    stats.inserted += result.inserted;
    stats.rebuilt += result.rebuilt.length;
    for (const e of result.newEvents) for (const topic of topicsOf(e)) deps.bus.publish(topic, e.name, { ...e.data, market: e.market, txHash: e.txHash, logIndex: e.logIndex, blockTimeSec: e.blockTimeSec });
    const gaps = result.markets.length ? await writer.gaps(result.markets) : [];
    for (const g of gaps) await refetchMarket(g.market, range.to);
    const status = range.live ? await reader.status() : null;
    return {
      why: `${range.live ? "live" : "backfill"} ${range.from}..${range.to} (+${result.inserted} events${result.rebuilt.length ? `, rebuilt ${result.rebuilt.length}` : ""}${gaps.length ? `, ${gaps.length} gap(s) refetched` : ""}) · ${head - range.to} behind`,
      detail: { ...stats, cursor: range.to, head, events: status?.events ?? null, fills: status?.fills ?? null, windowsOpened: status?.windows_opened ?? null, windowsResolved: status?.windows_resolved ?? null },
      nextDelayMs: range.to < head ? 50 : LIVE_MS,
    };
  };
  return runActor({ name: "indexer", log: deps.log, dryRun: false, everyMs: LIVE_MS, pass });
}
