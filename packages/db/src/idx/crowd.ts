/**
 * The crowd's lean on one ticker (S6, L-04 "crowd sentiment"; Agari 03b30ab `web/src/app/api/sentiment/crowd.ts` took the
 * Up share of every taker's lots over an hour). Here a fill's two sides are each counted unless the side is the house
 * (D-215: its keys and the maker vault are never demand) — a Trading Balance or a product contract takes for a caller, so
 * it counts. A side leans UP when it buys YES or sells NO (kinds 0, 3) and DOWN when it sells YES or buys NO (1, 2), by
 * its lots, over every lane of the ticker since `sinceSec`.
 */
import type postgres from "postgres";

type Sql = postgres.Sql;

export interface CrowdQuery {
  /** Lower-case addresses that are never demand: the house's keys and the maker vault. */
  house: readonly string[];
  symbol: string;
  sinceSec: number;
}

export interface CrowdLean {
  upLots: bigint;
  downLots: bigint;
  /** Demand sides counted (a fill between two callers is two sides). */
  sides: number;
}

export async function readCrowdLean(sql: Sql, q: CrowdQuery): Promise<CrowdLean> {
  const house = q.house.map((a) => a.toLowerCase());
  const [row] = await sql`
    with f as (
      select f.taker, f.maker, f.taker_kind, f.maker_kind, f.lots
      from idx_fills f join idx_markets m on m.market = f.market
      where m.symbol = ${q.symbol} and f.ts_sec >= ${q.sinceSec}
    ),
    s as (
      select taker_kind as kind, lots from f where taker <> all(${house as string[]}::text[])
      union all
      select maker_kind, lots from f where maker <> all(${house as string[]}::text[])
    )
    select count(*)::int as sides,
      coalesce(sum(lots) filter (where kind in (0, 3)), 0)::text as up_lots,
      coalesce(sum(lots) filter (where kind in (1, 2)), 0)::text as down_lots
    from s`;
  return { upLots: BigInt(row!.up_lots as string), downLots: BigInt(row!.down_lots as string), sides: row!.sides as number };
}
