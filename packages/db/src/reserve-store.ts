/**
 * Reserve snapshots and stock-sync pushes over Postgres (S14 14o; `migrations/bridge`; D-227 R4-12). ops
 * `reserve-watch` writes one snapshot per ticker every 5 minutes; `/reserves` reads the latest (its issuer cursor), the
 * 30-day status bar and the alert log. ops `stock-sync` records each push it pays for.
 */
import type { CheckStatus, Network, ReserveCheckId, ReserveVerdict } from "@cwf/core";
import type { Sql } from "./index";

export interface ReserveSnapshotInput {
  network: Network;
  ticker: string;
  atMs: number;
  tempoBlock: bigint;
  baseBlock: bigint | null;
  rhBlock: bigint | null;
  lockedSD: bigint | null;
  outstandingSD: bigint | null;
  owedSD: bigint | null;
  transitSD: bigint | null;
  supplySD: bigint;
  deferredSD: bigint;
  mintedNetSD: bigint;
  supplyCapSD: bigint;
  issuers: string[] | null;
  issuersToBlock: bigint | null;
  verdict: ReserveVerdict;
  checks: { id: ReserveCheckId; status: CheckStatus }[];
  alert: string | null;
}

export type ReserveSnapshotRow = ReserveSnapshotInput & { id: number };

/** One UTC day of a ticker's snapshots, worst verdict wins (the 30-day bar). */
export interface ReserveDay {
  day: string;
  verdict: ReserveVerdict;
  snapshots: number;
}

export interface ReserveStore {
  insert(s: ReserveSnapshotInput): Promise<void>;
  /** The newest snapshot per ticker. */
  latest(network: Network): Promise<ReserveSnapshotRow[]>;
  /** Per ticker, per UTC day, since `sinceMs`. */
  days(network: Network, sinceMs: number): Promise<Record<string, ReserveDay[]>>;
  /** Snapshots that raised an alert, newest first. */
  alerts(network: Network, limit?: number): Promise<ReserveSnapshotRow[]>;
}

type Row = {
  id: string; network: Network; ticker: string; at_ms: string; tempo_block: string; base_block: string | null; rh_block: string | null;
  locked_sd: string | null; outstanding_sd: string | null; owed_sd: string | null; transit_sd: string | null; supply_sd: string; deferred_sd: string;
  minted_net_sd: string; supply_cap_sd: string; issuers: string[] | null; issuers_to_block: string | null; verdict: ReserveVerdict;
  checks: { id: ReserveCheckId; status: CheckStatus }[]; alert: string | null;
};

const big = (v: string | null) => (v === null ? null : BigInt(v));
const str = (v: bigint | null) => (v === null ? null : v.toString());

const toRow = (r: Row): ReserveSnapshotRow => ({
  id: Number(r.id), network: r.network, ticker: r.ticker, atMs: Number(r.at_ms), tempoBlock: BigInt(r.tempo_block), baseBlock: big(r.base_block), rhBlock: big(r.rh_block),
  lockedSD: big(r.locked_sd), outstandingSD: big(r.outstanding_sd), owedSD: big(r.owed_sd), transitSD: big(r.transit_sd), supplySD: BigInt(r.supply_sd), deferredSD: BigInt(r.deferred_sd),
  mintedNetSD: BigInt(r.minted_net_sd), supplyCapSD: BigInt(r.supply_cap_sd), issuers: r.issuers, issuersToBlock: big(r.issuers_to_block), verdict: r.verdict, checks: r.checks, alert: r.alert,
});

const RANK: Record<ReserveVerdict, number> = { backed: 0, partial: 1, short: 2 };

export function createPgReserveStore(sql: Sql): ReserveStore {
  const json = (v: unknown) => sql.json(v as Parameters<typeof sql.json>[0]);
  return {
    async insert(s) {
      await sql`insert into reserve_snapshots (network, ticker, at_ms, tempo_block, base_block, rh_block, locked_sd, outstanding_sd, owed_sd, transit_sd, supply_sd, deferred_sd, minted_net_sd, supply_cap_sd, issuers, issuers_to_block, verdict, checks, alert)
        values (${s.network}, ${s.ticker}, ${s.atMs}, ${s.tempoBlock.toString()}, ${str(s.baseBlock)}, ${str(s.rhBlock)}, ${str(s.lockedSD)}, ${str(s.outstandingSD)}, ${str(s.owedSD)}, ${str(s.transitSD)},
          ${s.supplySD.toString()}, ${s.deferredSD.toString()}, ${s.mintedNetSD.toString()}, ${s.supplyCapSD.toString()}, ${s.issuers ? s.issuers.map((a) => a.toLowerCase()) : null}, ${str(s.issuersToBlock)},
          ${s.verdict}, ${json(s.checks)}, ${s.alert})`;
    },
    async latest(network) {
      const rows = await sql<Row[]>`select distinct on (ticker) * from reserve_snapshots where network = ${network} order by ticker, at_ms desc`;
      return rows.map(toRow);
    },
    async days(network, sinceMs) {
      const rows = await sql<{ ticker: string; day: string; verdicts: ReserveVerdict[]; n: string }[]>`
        select ticker, to_char(to_timestamp(at_ms / 1000) at time zone 'UTC', 'YYYY-MM-DD') as day, array_agg(distinct verdict) as verdicts, count(*) as n
        from reserve_snapshots where network = ${network} and at_ms >= ${sinceMs} group by ticker, day order by ticker, day`;
      const out: Record<string, ReserveDay[]> = {};
      for (const r of rows) {
        const worst = r.verdicts.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "backed" as ReserveVerdict);
        (out[r.ticker] ??= []).push({ day: r.day, verdict: worst, snapshots: Number(r.n) });
      }
      return out;
    },
    async alerts(network, limit = 20) {
      const rows = await sql<Row[]>`select * from reserve_snapshots where network = ${network} and alert is not null order by at_ms desc limit ${Math.min(limit, 100)}`;
      return rows.map(toRow);
    },
  };
}

export type StockSyncStatus = "sent" | "delivered" | "stuck" | "failed";

export interface StockSyncRow {
  id: number;
  network: Network;
  srcTx: string;
  guid: string | null;
  seq: bigint | null;
  tokens: string[];
  feeWei: bigint;
  status: StockSyncStatus;
  note: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  deliveredAtMs: number | null;
}

export interface StockSyncStore {
  record(input: { network: Network; srcTx: string; guid: string | null; seq: bigint | null; tokens: string[]; feeWei: bigint; nowMs: number }): Promise<void>;
  open(network: Network): Promise<StockSyncRow[]>;
  mark(id: number, status: StockSyncStatus, note: string | null, nowMs: number, deliveredAtMs?: number | null): Promise<void>;
  last(network: Network): Promise<StockSyncRow | null>;
}

type SyncRow = { id: string; network: Network; src_tx: string; guid: string | null; seq: string | null; tokens: string[]; fee_wei: string; status: StockSyncStatus; note: string | null; created_at_ms: string; updated_at_ms: string; delivered_at_ms: string | null };

const toSync = (r: SyncRow): StockSyncRow => ({
  id: Number(r.id), network: r.network, srcTx: r.src_tx, guid: r.guid, seq: big(r.seq), tokens: r.tokens, feeWei: BigInt(r.fee_wei), status: r.status, note: r.note,
  createdAtMs: Number(r.created_at_ms), updatedAtMs: Number(r.updated_at_ms), deliveredAtMs: r.delivered_at_ms === null ? null : Number(r.delivered_at_ms),
});

export function createPgStockSyncStore(sql: Sql): StockSyncStore {
  return {
    async record(i) {
      await sql`insert into stock_sync_messages (network, src_tx, guid, seq, tokens, fee_wei, created_at_ms, updated_at_ms)
        values (${i.network}, ${i.srcTx.toLowerCase()}, ${i.guid?.toLowerCase() ?? null}, ${str(i.seq)}, ${i.tokens.map((t) => t.toLowerCase())}, ${i.feeWei.toString()}, ${i.nowMs}, ${i.nowMs}) on conflict (src_tx) do nothing`;
    },
    async open(network) {
      return (await sql<SyncRow[]>`select * from stock_sync_messages where network = ${network} and status in ('sent', 'stuck') order by created_at_ms asc limit 20`).map(toSync);
    },
    async mark(id, status, note, nowMs, deliveredAtMs = null) {
      await sql`update stock_sync_messages set status = ${status}, note = ${note}, updated_at_ms = ${nowMs}, delivered_at_ms = coalesce(${deliveredAtMs}, delivered_at_ms) where id = ${id}`;
    },
    async last(network) {
      const [r] = await sql<SyncRow[]>`select * from stock_sync_messages where network = ${network} order by created_at_ms desc limit 1`;
      return r ? toSync(r) : null;
    },
  };
}
