// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:packages/db/src/idx/read.ts (seats/books dropped; claims,
// redemptions and per-market prints added for C.4.5).
/**
 * Read queries over the index for `/api/index/*` (C.4.5). Integers stay decimal strings; `*_ticklots` columns come back
 * with the Series `cash_unit`, so a caller turns them into base units exactly. Never a write gate: writes read the chain.
 */
import type postgres from "postgres";

type Sql = postgres.Sql;
export type IdxRow = Record<string, unknown>;

const LIMIT_MAX = 1_000;
export const clamp = (limit: number | undefined, fallback = 200) => Math.max(1, Math.min(LIMIT_MAX, Math.floor(limit ?? fallback)));

export interface IdxMarketQuery {
  market?: string;
  series?: string;
  symbol?: string;
  state?: "open" | "resolved" | "voided";
  /** Terminal Windows only. */
  settled?: boolean;
  /** Windows whose lock is still ahead of this instant (live lanes). */
  liveAtSec?: number;
  ids?: readonly string[];
  expiryFromSec?: number;
  expiryToSec?: number;
  limit?: number;
}

export interface IdxPage {
  market?: string;
  sinceSec?: number;
  limit?: number;
  offset?: number;
}

export function indexReader(sql: Sql) {
  const fillCols = sql`f.tx_hash, f.log_index, f.market, f.seq::text, f.block_number::text, f.ts_sec::text, f.taker, f.taker_kind, f.maker, f.maker_kind,
    f.maker_order_id::text, f.path, f.price_ticks, f.lots::text, f.maker_remaining::text`;
  const page = (q: IdxPage) => sql`limit ${clamp(q.limit)} offset ${Math.max(0, q.offset ?? 0)}`;
  return {
    /** Windows with their Series facts and all four prints. */
    async markets(q: IdxMarketQuery = {}): Promise<IdxRow[]> {
      return sql`
        select m.*, m.backing_lots::text, m.volume_lots::text, m.volume_ticklots::text, s.ticker, s.lot_base::text, s.tick_base::text, s.cash_unit::text,
          (select json_object_agg(p.which, json_build_object('source', p.source, 'priceE8', p.price_e8::text, 'sourceTsSec', p.source_ts_sec,
             'signers', p.signers, 'copied', p.copied, 'txHash', p.tx_hash)) from idx_prints p where p.market = m.market) as prints
        from idx_markets m left join idx_series s on s.series = m.series
        where m.opened_tx is not null
          ${q.market ? sql`and m.market = ${q.market}` : sql``} ${q.series ? sql`and m.series = ${q.series}` : sql``}
          ${q.symbol ? sql`and m.symbol = ${q.symbol}` : sql``} ${q.state ? sql`and m.state = ${q.state}` : sql``}
          ${q.settled ? sql`and m.state <> 'open'` : sql``} ${q.ids ? sql`and m.market = any(${q.ids as string[]}::text[])` : sql``}
          ${q.liveAtSec !== undefined ? sql`and m.state = 'open' and m.lock_at_sec > ${q.liveAtSec}` : sql``}
          ${q.expiryFromSec !== undefined ? sql`and m.expiry_sec >= ${q.expiryFromSec}` : sql``}
          ${q.expiryToSec !== undefined ? sql`and m.expiry_sec <= ${q.expiryToSec}` : sql``}
        order by m.expiry_sec ${q.liveAtSec !== undefined ? sql`asc` : sql`desc`} limit ${clamp(q.limit)}`;
    },

    /** A wallet's fills on either side, newest first. */
    async walletFills(wallet: string, q: IdxPage = {}): Promise<IdxRow[]> {
      return sql`select ${fillCols} from idx_fills f where (f.taker = ${wallet} or f.maker = ${wallet})
        ${q.market ? sql`and f.market = ${q.market}` : sql``} ${q.sinceSec !== undefined ? sql`and f.ts_sec >= ${q.sinceSec}` : sql``}
        order by f.ts_sec desc, f.block_number desc, f.log_index desc ${page(q)}`;
    },

    /** The tape of one Window, or venue-wide, newest first. */
    async fills(q: IdxPage = {}): Promise<IdxRow[]> {
      return sql`select ${fillCols}, m.symbol, m.cadence_sec, m.basis from idx_fills f left join idx_markets m using (market)
        where true ${q.market ? sql`and f.market = ${q.market}` : sql``} ${q.sinceSec !== undefined ? sql`and f.ts_sec >= ${q.sinceSec}` : sql``}
        order by f.ts_sec desc, f.block_number desc, f.log_index desc ${page(q)}`;
    },

    /** Complete sets, credit withdrawals and redemptions of a wallet (Masayume `getRouterActions`). */
    async walletActions(wallet: string, q: IdxPage = {}): Promise<IdxRow[]> {
      return sql`
        select e.tx_hash, e.log_index, e.name, e.market, e.seq::text, e.block_time_sec::text, e.data from idx_events e
        where e.name in ('CompleteSet', 'Redeemed', 'CreditWithdrawn')
          and (lower(e.data->>'owner') = ${wallet} or lower(e.data->>'holder') = ${wallet})
        order by e.block_number desc, e.log_index desc ${page(q)}`;
    },

    /** A wallet's positions with the Window's state. */
    async positions(owner: string, q: { unredeemedOnly?: boolean; limit?: number } = {}): Promise<IdxRow[]> {
      return sql`
        select p.*, p.yes_lots::text, p.no_lots::text, p.paid_ticklots::text, p.received_ticklots::text, p.redeemed_base::text, p.payout_base::text,
          m.symbol, m.cadence_sec, m.basis, m.expiry_sec, m.lock_at_sec, m.state, m.winner, m.payout_yes, m.payout_no, m.void_reason,
          s.cash_unit::text, s.lot_base::text, m.last_price_ticks, m.series, m.trading_start_sec, m.resolved_ts_sec
        from idx_positions p join idx_markets m on m.market = p.market left join idx_series s on s.series = m.series
        where p.owner = ${owner} ${q.unredeemedOnly ? sql`and not p.redeemed` : sql``}
        order by p.last_ts_sec desc nulls last limit ${clamp(q.limit)}`;
    },

    /** What a wallet can claim: terminal Windows with an unredeemed position, plus held credit (P12). */
    async claims(owner: string): Promise<IdxRow[]> {
      return sql`
        select p.market, p.yes_lots::text, p.no_lots::text, m.symbol, m.state, m.winner, m.payout_yes, m.payout_no, m.expiry_sec, m.resolved_ts_sec,
          coalesce(c.held_base - c.withdrawn_base, 0)::text as held_credit_base
        from idx_positions p join idx_markets m on m.market = p.market left join idx_credits c on c.market = p.market and c.holder = p.owner
        where p.owner = ${owner} and m.state <> 'open' and (not p.redeemed or coalesce(c.held_base - c.withdrawn_base, 0) > 0)
        order by m.resolved_ts_sec desc nulls last limit 500`;
    },

    /**
     * A wallet's Trading Balance history (index/0002, S7; per vault since index/0004, S24.2): each vault's account as the
     * events moved it (`accounts`; `account` the most recently moved, as before), every grant it made (live, revoked or
     * replaced — the trust surface's history), its latest vault fills and settlements, each naming its vault. One row.
     */
    async vault(owner: string): Promise<IdxRow[]> {
      const accounts = await sql`select vault, owner, available_base::text, private_available_base::text, deposited_base::text, withdrawn_base::text, updated_block::text from idx_vault_accounts where owner = ${owner} order by updated_block desc`;
      const grants = await sql`
        select vault, grant_id::text, owner, actor, kind, exit_tolerance_bps, exit_slack_bps, max_stake_per_trade_base::text, max_daily_spend_base::text, max_open_positions, max_price_raw::text, market,
          expires_at_sec::text, budget_base::text, funded_base::text, spent_base::text, taps, revoked, returned_base::text, created_tx, created_at_sec::text,
          revoked_tx, revoked_at_sec::text, last_used_tx, last_used_at_sec::text
        from idx_vault_grants where owner = ${owner} order by created_block desc, grant_id desc limit 100`;
      const executions = await sql`
        select tx_hash, log_index, vault, market, grant_id::text, outcome_idx, is_buy, cash_delta::text, token_delta::text, actor, at_sec::text
        from idx_vault_executions where owner = ${owner} order by at_sec desc, log_index desc limit 200`;
      const settlements = await sql`
        select tx_hash, vault, market, payout_base::text, yes_redeemed::text, no_redeemed::text, settled_by, at_sec::text
        from idx_vault_settlements where owner = ${owner} order by at_sec desc limit 200`;
      return [{ account: accounts[0] ?? null, accounts, grants, executions, settlements }];
    },

    async orders(q: { owner?: string; market?: string; openOnly?: boolean; limit?: number }): Promise<IdxRow[]> {
      return sql`
        select *, lots::text, filled_lots::text, remaining_lots::text, rested_order_id::text from idx_orders
        where true ${q.owner ? sql`and owner = ${q.owner}` : sql``} ${q.market ? sql`and market = ${q.market}` : sql``} ${q.openOnly ? sql`and status = 'open'` : sql``}
        order by ts_sec desc, seq desc limit ${clamp(q.limit)}`;
    },

    async prints(market: string): Promise<IdxRow[]> {
      return sql`select which, source, price_e8::text, source_ts_sec::text, signers, copied, recorded_ts_sec::text, tx_hash from idx_prints where market = ${market} order by which`;
    },

    async candles(market: string, fromSec: number, toSec: number): Promise<IdxRow[]> {
      return sql`select bucket_sec::text, open_ticks, high_ticks, low_ticks, close_ticks, volume_lots::text, trades from idx_candles
        where market = ${market} and bucket_sec between ${fromSec} and ${toSec} order by bucket_sec`;
    },

    /** Recorded prints of a ticker over time: every open and close boundary once. */
    async printHistory(symbol: string, fromSec: number, toSec: number, limit?: number): Promise<IdxRow[]> {
      return sql`
        select distinct on (p.source_ts_sec, p.source) p.source_ts_sec::text, p.source, p.price_e8::text, p.signers
        from idx_prints p join idx_markets m on m.market = p.market
        where m.symbol = ${symbol} and p.which in (0, 1) and p.source_ts_sec between ${fromSec} and ${toSec}
        order by p.source_ts_sec, p.source limit ${clamp(limit, 500)}`;
    },

    /** A ticker's most recent recorded opening or closing print (a link preview's "last signed print"). */
    async latestPrint(symbol: string): Promise<IdxRow | null> {
      const [row] = await sql`
        select p.source_ts_sec::text, p.price_e8::text, p.signers from idx_prints p join idx_markets m on m.market = p.market
        where m.symbol = ${symbol} and p.which in (0, 1) order by p.source_ts_sec desc limit 1`;
      return row ?? null;
    },

    /**
     * Each ticker's most recent recorded opening or closing print, in one query (the batched `latestPrint`): the landing's
     * tape keeps an asset's last signed price while its soonest Window still waits on its print (R6 landing L02).
     */
    async latestPrints(symbols: readonly string[]): Promise<IdxRow[]> {
      if (symbols.length === 0) return [];
      return sql`
        select distinct on (m.symbol) m.symbol, p.price_e8::text, p.source_ts_sec::text, p.signers, p.source
        from idx_prints p join idx_markets m on m.market = p.market
        where m.symbol = any(${symbols as string[]}::text[]) and p.which in (0, 1)
        order by m.symbol, p.source_ts_sec desc`;
    },

    /** Counts of what the index holds at or below `block` (the recount compares them with an independent chain walk). */
    async countsThrough(chainId: number, block: number): Promise<IdxRow> {
      const [row] = await sql`
        with ev as (select * from idx_events where chain_id = ${chainId} and block_number <= ${block})
        select (select count(*) from ev)::int as events, (select count(distinct tx_hash) from ev)::int as txs,
          (select count(*) from idx_fills where chain_id = ${chainId} and block_number <= ${block})::int as fills,
          (select coalesce(sum(lots), 0)::text from idx_fills where chain_id = ${chainId} and block_number <= ${block}) as fill_lots,
          (select count(*) from ev where name = 'WindowOpened')::int as windows_opened,
          (select count(*) from ev where name = 'WindowResolved')::int as windows_resolved,
          (select count(*) from ev where name = 'PrintRecorded')::int as prints,
          (select count(*) from idx_redemptions r join ev on ev.tx_hash = r.tx_hash and ev.log_index = r.log_index)::int as redemptions,
          (select coalesce(sum(r.total_base), 0)::text from idx_redemptions r join ev on ev.tx_hash = r.tx_hash and ev.log_index = r.log_index) as redeemed_base,
          (select count(*) from (select market from idx_events where market is not null group by market having count(distinct seq) < max(seq)) g)::int as markets_with_gaps,
          (select json_object_agg(name, n) from (select name, count(*)::int as n from ev group by name) c) as by_name`;
      return row!;
    },

    /**
     * Per-Window digest at or below `block`, from stored events and fills only (the recount diffs it against its own
     * chain replay). `touched_after` marks Windows with events past `block`: their live position sums are not as of it.
     * Set-based (F-S5-02): one indexed read per kind of fact, grouped by Window and joined once — the correlated form
     * ran ten subqueries for each of ~50,000 Windows over a materialised copy of every event and took more than 12
     * minutes; this one takes ~4 s and returned identical rows on a 298-Window sample at the same block.
     */
    async marketDigest(chainId: number, block: number): Promise<IdxRow[]> {
      return sql`
        with opened as (select market from idx_events where chain_id = ${chainId} and name = 'WindowOpened' and block_number <= ${block} and market is not null),
        res as (
          select market, case when (data->>'state')::int = 1 then 'resolved' else 'voided' end as state, (data->>'winner')::int as winner,
            coalesce(data->>'openE8', '') as open_e8, coalesce(data->>'closeE8', '') as close_e8
          from idx_events where chain_id = ${chainId} and name = 'WindowResolved' and block_number <= ${block}),
        fl as (select market, count(*)::int as fills, sum(lots) as fill_lots from idx_fills where chain_id = ${chainId} and block_number <= ${block} group by market),
        pr as (select market, count(*)::int as prints from idx_events where chain_id = ${chainId} and name = 'PrintRecorded' and block_number <= ${block} group by market),
        rd as (
          select r.market, sum(r.total_base) as redeemed from idx_redemptions r
          join idx_events e on e.chain_id = r.chain_id and e.tx_hash = r.tx_hash and e.log_index = r.log_index
          where e.chain_id = ${chainId} and e.block_number <= ${block} and e.market is not null group by r.market),
        pos as (select market, sum(yes_lots) as yes, sum(no_lots) as no from idx_positions group by market),
        later as (select distinct market from idx_events where chain_id = ${chainId} and block_number > ${block} and market is not null)
        select o.market, coalesce(res.state, 'open') as state, res.winner, coalesce(res.open_e8, '') as open_e8, coalesce(res.close_e8, '') as close_e8,
          coalesce(fl.fills, 0) as fills, coalesce(fl.fill_lots, 0)::text as fill_lots, coalesce(pr.prints, 0) as prints,
          coalesce(rd.redeemed, 0)::text as redeemed_base, coalesce(pos.yes, 0)::text as open_yes_lots, coalesce(pos.no, 0)::text as open_no_lots,
          later.market is not null as touched_after
        from opened o left join res using (market) left join fl using (market) left join pr using (market) left join rd using (market)
          left join pos using (market) left join later using (market)
        order by o.market`;
    },

    /** Counts and freshness for `/api/index/status`, `/health` and the soak. */
    /**
     * The landing's figures (S20): Windows opened, resolved and open now, and fills — counts over the indexed markets
     * and fills only (status() also scans every event), cheap enough to serve every few minutes.
     */
    async headline(): Promise<IdxRow> {
      const [row] = await sql`
        select (select count(*) from idx_markets where opened_tx is not null)::int as windows_opened,
          (select count(*) from idx_markets where state <> 'open')::int as windows_resolved,
          (select count(*) from idx_markets where state = 'open' and opened_tx is not null)::int as windows_open,
          (select count(*) from idx_markets where state <> 'open' and resolved_ts_sec >= extract(epoch from date_trunc('day', now() at time zone 'utc'))::bigint)::int as settled_today,
          (select count(*) from idx_fills)::int as fills`;
      return row!;
    },

    /** The newest settled Window of each ticker, the `limit` newest of those, with their prints (five assets, not one batch). */
    async recentSettledBySymbol(limit = 5): Promise<IdxRow[]> {
      return sql`
        select * from (
          select distinct on (m.symbol) m.market, m.symbol, m.cadence_sec, m.basis, m.expiry_sec, m.state, m.winner, m.resolved_ts_sec,
            (select json_object_agg(p.which, json_build_object('priceE8', p.price_e8::text, 'signers', p.signers)) from idx_prints p where p.market = m.market) as prints
          from idx_markets m where m.opened_tx is not null and m.state <> 'open'
          order by m.symbol, m.expiry_sec desc
        ) newest order by expiry_sec desc limit ${clamp(limit, 20)}`;
    },

    async status(): Promise<IdxRow> {
      const [row] = await sql`
        select (select count(*) from idx_events)::int as events, (select count(*) from idx_fills)::int as fills,
          (select count(*) from idx_markets where opened_tx is not null)::int as windows_opened,
          (select count(*) from idx_markets where state <> 'open')::int as windows_resolved,
          (select count(*) from idx_markets where state = 'open' and opened_tx is not null)::int as windows_open,
          (select max(block_time_sec) from idx_events)::text as last_block_time_sec, (select max(block_number) from idx_events)::text as last_block,
          (select json_agg(json_build_object('chainId', chain_id, 'address', address, 'block', block::text, 'updatedAtMs', updated_at_ms::text)) from idx_cursor) as cursors,
          (select json_object_agg(name, n) from (select name, count(*)::int as n from idx_events group by name) c) as by_name`;
      return row!;
    },
  };
}

export type IndexReader = ReturnType<typeof indexReader>;
