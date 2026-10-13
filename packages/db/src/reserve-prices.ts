// Earn's reserve history (R6 money, S09; D-230; `migrations/earn/0001`): the ops `reserve-pricer` writes one sample per
// reserve per sampled block; `/api/earn/history` reads a range of them, evenly thinned to a drawable count with the
// first and the last point exact (the line ends on the newest stored price). Amounts stay base-unit strings.
import type { Sql } from "./index";

export interface ReservePriceRow {
  reserve: string;
  blockNumber: bigint;
  atSec: number;
  sharePriceRaw: bigint;
  totalValueBase: bigint;
  liquidBase: bigint;
  committedBase: bigint;
  supplyShares: bigint;
}

/** Evenly spaced picks across `rows`, the first and the last always kept; `rows` as given when it already fits. Pure. */
export function downsample<T>(rows: readonly T[], maxPoints: number): T[] {
  if (maxPoints < 2 || rows.length <= maxPoints) return [...rows];
  const out: T[] = [];
  const step = (rows.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) out.push(rows[Math.round(i * step)]!);
  return out;
}

type Row = { reserve: string; block_number: string; at_sec: string; share_price_raw: string; total_value_base: string; liquid_base: string; committed_base: string; supply_shares: string };

const toRow = (r: Row): ReservePriceRow => ({
  reserve: r.reserve,
  blockNumber: BigInt(r.block_number),
  atSec: Number(r.at_sec),
  sharePriceRaw: BigInt(r.share_price_raw),
  totalValueBase: BigInt(r.total_value_base),
  liquidBase: BigInt(r.liquid_base),
  committedBase: BigInt(r.committed_base),
  supplyShares: BigInt(r.supply_shares),
});

export interface ReservePriceStore {
  /** Idempotent: a block already stored for a reserve is skipped. */
  insert(rows: readonly ReservePriceRow[]): Promise<number>;
  /** The newest stored sample of a reserve, or null. */
  newest(reserve: string): Promise<ReservePriceRow | null>;
  /** The oldest stored sample (its launch, once the backfill has started), or null. */
  oldest(reserve: string): Promise<ReservePriceRow | null>;
  /** Samples at or after `sinceSec`, oldest first, thinned to `maxPoints`. */
  series(reserve: string, sinceSec: number, maxPoints: number): Promise<ReservePriceRow[]>;
  /** How many samples a reserve has (the pricer's heartbeat). */
  count(reserve: string): Promise<number>;
}

export function createPgReservePrices(sql: Sql): ReservePriceStore {
  return {
    async insert(rows) {
      let inserted = 0;
      for (const r of rows) {
        const done = await sql`
          insert into reserve_prices (reserve, block_number, at_sec, share_price_raw, total_value_base, liquid_base, committed_base, supply_shares)
          values (${r.reserve}, ${r.blockNumber.toString()}, ${r.atSec}, ${r.sharePriceRaw.toString()}::numeric, ${r.totalValueBase.toString()}::numeric,
            ${r.liquidBase.toString()}::numeric, ${r.committedBase.toString()}::numeric, ${r.supplyShares.toString()}::numeric)
          on conflict (reserve, block_number) do nothing returning block_number`;
        inserted += done.length;
      }
      return inserted;
    },
    async newest(reserve) {
      const [row] = await sql<Row[]>`select * from reserve_prices where reserve = ${reserve} order by block_number desc limit 1`;
      return row ? toRow(row) : null;
    },
    async oldest(reserve) {
      const [row] = await sql<Row[]>`select * from reserve_prices where reserve = ${reserve} order by block_number asc limit 1`;
      return row ? toRow(row) : null;
    },
    async series(reserve, sinceSec, maxPoints) {
      const rows = await sql<Row[]>`select * from reserve_prices where reserve = ${reserve} and at_sec >= ${sinceSec} order by at_sec asc, block_number asc`;
      return downsample(rows.map(toRow), maxPoints);
    },
    async count(reserve) {
      const [row] = await sql<{ n: number }[]>`select count(*)::int as n from reserve_prices where reserve = ${reserve}`;
      return row?.n ?? 0;
    },
  };
}
