// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:packages/db/src/idx/write.ts — one DB transaction per
// block window instead of per Solana transaction; finality promotion and dropped-tx removal are gone (Tempo finalizes
// every block, D-030).
/**
 * The indexer's writer (plan C.4.1 `apply.ts`): one DB transaction per window — insert events keyed
 * `(chain_id, tx_hash, log_index)` with `ON CONFLICT DO NOTHING RETURNING`, apply projections only for newly inserted
 * rows, rebuild any Market whose events arrived out of `seq` order, then advance the cursor. Replaying a window is a no-op.
 */
import type postgres from "postgres";
import { applyEvent } from "./apply";
import type { IdxCursor, IdxEvent, IdxSeries } from "./types";

type Sql = postgres.Sql;
type Tx = postgres.TransactionSql;
type EventRow = { chain_id: number; tx_hash: string; log_index: number; block_number: string; block_time_sec: string; address: string; name: string; market: string | null; seq: string | null; data: Record<string, unknown> };

/** Every projection a Market rebuild clears (idx_series and the engine-wide tables are not per-market). */
export const MARKET_PROJECTIONS = ["idx_candles", "idx_positions", "idx_fills", "idx_orders", "idx_prints", "idx_redemptions", "idx_credits", "idx_markets"] as const;
export const INDEX_TABLES = [
  ...MARKET_PROJECTIONS, "idx_series", "idx_crank_opt_outs", "idx_vault_accounts", "idx_vault_grants", "idx_vault_executions", "idx_vault_settlements", "idx_strategies", "idx_subscriptions", "idx_agent_feedback", "idx_launches", "idx_launch_trades", "idx_launch_balances", "idx_events", "idx_cursor",
] as const;

export const eventOfRow = (r: EventRow): IdxEvent => ({
  chainId: r.chain_id, txHash: r.tx_hash, logIndex: r.log_index, blockNumber: Number(r.block_number), blockTimeSec: Number(r.block_time_sec),
  address: r.address, name: r.name, market: r.market, seq: r.seq, data: r.data,
});

const order = (a: IdxEvent, b: IdxEvent) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;

async function rebuildMarketTx(tx: Tx, market: string): Promise<void> {
  for (const table of MARKET_PROJECTIONS) await tx`delete from ${tx(table)} where market = ${market}`;
  const rows = await tx<EventRow[]>`select * from idx_events where market = ${market} order by seq, block_number, log_index`;
  for (const row of rows) await applyEvent(tx, eventOfRow(row));
}

export type WindowResult = { inserted: number; applied: number; markets: string[]; rebuilt: string[]; newEvents: IdxEvent[] };

export function indexWriter(sql: Sql) {
  return {
    async cursor(chainId: number, address: string): Promise<number | null> {
      const [row] = await sql<{ block: string }[]>`select block::text from idx_cursor where chain_id = ${chainId} and address = ${address.toLowerCase()}`;
      return row ? Number(row.block) : null;
    },

    async knownSeries(): Promise<Set<string>> {
      return new Set((await sql<{ series: string }[]>`select series from idx_series`).map((r) => r.series));
    },

    async upsertSeries(rows: readonly IdxSeries[]): Promise<void> {
      for (const s of rows) {
        await sql`
          insert into idx_series (series, ticker, symbol, cadence_sec, basis, lot_base, tick_base, cash_unit)
          values (${s.series.toLowerCase()}, ${s.ticker}, ${s.symbol}, ${s.cadenceSec}, ${s.basis}, ${s.lotBase}::numeric, ${s.tickBase}::numeric, ${s.cashUnit}::numeric)
          on conflict (series) do update set symbol = excluded.symbol`;
        // Windows seen before their Series row get their symbol and cadence now.
        await sql`update idx_markets set symbol = ${s.symbol}, cadence_sec = ${s.cadenceSec} where series = ${s.series.toLowerCase()} and symbol is null`;
      }
    },

    /**
     * One window of events, atomically, plus the cursor. An event whose `seq` is below its Market's applied `seq` (or a
     * repeat of it from another transaction) marks that Market for a rebuild from stored events in the same DB transaction.
     */
    async writeWindow(events: readonly IdxEvent[], cursor: IdxCursor): Promise<WindowResult> {
      return sql.begin(async (tx) => {
        const markets = [...new Set(events.map((e) => e.market).filter((m): m is string => m !== null))].sort();
        const lastSeq = new Map<string, { seq: bigint; tx: string | null }>();
        for (const m of markets) await tx`select pg_advisory_xact_lock(hashtext(${m}))`;
        if (markets.length) for (const r of await tx<{ market: string; last_seq: string }[]>`select market, last_seq::text from idx_markets where market = any(${markets}::text[])`) lastSeq.set(r.market, { seq: BigInt(r.last_seq), tx: null });
        const rebuild = new Set<string>();
        const newEvents: IdxEvent[] = [];
        let applied = 0;
        for (const e of [...events].sort(order)) {
          const ins = await tx`
            insert into idx_events (chain_id, tx_hash, log_index, block_number, block_time_sec, address, name, market, seq, data)
            values (${e.chainId}, ${e.txHash}, ${e.logIndex}, ${e.blockNumber}, ${e.blockTimeSec}, ${e.address.toLowerCase()}, ${e.name}, ${e.market}, ${e.seq}::bigint, ${tx.json(e.data as postgres.JSONValue)})
            on conflict do nothing returning log_index`;
          if (ins.length === 0) continue;
          newEvents.push(e);
          if (!e.market || e.seq === null) {
            await applyEvent(tx, e);
            applied++;
            continue;
          }
          if (rebuild.has(e.market)) continue;
          const seq = BigInt(e.seq);
          const last = lastSeq.get(e.market) ?? { seq: 0n, tx: null };
          // One seq is stamped on every event of one call (D-065): equal seq is in order only inside the same transaction.
          if (seq < last.seq || (seq === last.seq && last.tx !== e.txHash)) {
            rebuild.add(e.market);
            continue;
          }
          await applyEvent(tx, e);
          applied++;
          lastSeq.set(e.market, { seq, tx: e.txHash });
        }
        for (const m of rebuild) await rebuildMarketTx(tx, m);
        await tx`
          insert into idx_cursor (chain_id, address, block, updated_at_ms) values (${cursor.chainId}, ${cursor.address.toLowerCase()}, ${cursor.block}, ${Date.now()})
          on conflict (chain_id, address) do update set block = excluded.block, updated_at_ms = excluded.updated_at_ms where idx_cursor.block <= excluded.block`;
        return { inserted: newEvents.length, applied, markets, rebuilt: [...rebuild], newEvents };
      });
    },

    async rebuildMarkets(markets: readonly string[]): Promise<void> {
      await sql.begin(async (tx) => {
        for (const market of markets) await rebuildMarketTx(tx, market);
      });
    },

    /** Markets whose stored `seq` values have holes: fewer distinct seqs than the highest seq (seq starts at 1). */
    async gaps(markets?: readonly string[]): Promise<Array<{ market: string; have: number; maxSeq: number }>> {
      const rows = await sql<{ market: string; have: number; max_seq: string }[]>`
        select market, count(distinct seq)::int as have, max(seq)::text as max_seq from idx_events
        where market is not null ${markets ? sql`and market = any(${markets as string[]}::text[])` : sql``}
        group by market having count(distinct seq) < max(seq)`;
      return rows.map((r) => ({ market: r.market, have: r.have, maxSeq: Number(r.max_seq) }));
    },

    /** Full rebuild: every idx_ table, cursors included. */
    async truncate(): Promise<void> {
      await sql.unsafe(`truncate ${INDEX_TABLES.join(", ")}`);
    },
  };
}

export type IndexWriter = ReturnType<typeof indexWriter>;
