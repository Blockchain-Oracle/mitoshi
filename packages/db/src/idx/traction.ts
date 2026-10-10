/**
 * `/stats`'s read (S5, L-15): who took a side on a Window, over the whole index (Masayume 68f7a09
 * `features/stats`'s 24 h cap was DreamDEX's paging limit, which our own index doesn't have). Every figure comes from
 * stored engine events: fills, redemptions, vault executions and settlements, Windows and prints. Nothing is
 * self-reported.
 *
 * A fill counts as a call when either side isn't the house. Each side that isn't the house names a wallet: itself, or —
 * when it is a Trading Balance vault — the owner the vault executed for (`idx_vault_executions` in the same tx and
 * Window). A side that is another product contract (Boost, Parlay, Range, the private desk) is a call whose owner this
 * index doesn't record yet; it is counted as a call and reported as unattributed, never guessed.
 *
 * Kinds are the engine's (0 BUY_YES, 1 SELL_YES, 2 BUY_NO, 3 SELL_NO); a fill's price is the YES price in ticks of a
 * 1,000-tick pair. A direct path (0, 1) trades one outcome between the two sides, so the maker holds the opposite
 * buy/sell of the same outcome at the same price; a mint or burn (2, 3) pairs both outcomes, so the maker holds the
 * same buy/sell of the other outcome at the complement price.
 */
import type postgres from "postgres";

type Sql = postgres.Sql;

const PAIR_TICKS = 1000;
const DAY_SEC = 86_400;

export interface TractionQuery {
  /** Lower-case addresses that are never demand: the house's keys and the maker vault. */
  house: readonly string[];
  /** Trading Balance vaults, current and previous: their sides are attributed to the owner they executed for. */
  vaults: readonly string[];
  /** Contracts that take for a user without an owner in this index (Boost, Parlay, Range, the private desk). */
  products: readonly string[];
  nowSec: number;
  /** How many recent calls to return (default 12). */
  recent?: number;
}

export interface TractionCall {
  txHash: string;
  tsSec: number;
  wallet: string | null;
  kind: number;
  symbol: string;
  cadenceSec: number;
  cashBase: string;
}

export interface Traction {
  wallets: number;
  wallets24h: number;
  calls: number;
  calls24h: number;
  /** Calls a product contract took for someone the index can't name yet. */
  unattributed: number;
  /** pathUSD base units that changed hands on the calls, from the caller's side. */
  tradedBase: string;
  /** pathUSD base units paid to wallets: redemptions to a wallet plus Trading Balance settlements. */
  paidBase: string;
  /** Fills where both sides were the house (its own taker against its own maker), disclosed apart. */
  houseFills: number;
  windowsOpened: number;
  windowsResolved: number;
  windowsVoided: number;
  windowsOpen: number;
  prints: number;
  /** UTC day (epoch day) → new wallets that day and calls that day, oldest first, every day from the first call. */
  days: { day: number; newWallets: number; calls: number }[];
  recent: TractionCall[];
}

export async function readTraction(sql: Sql, q: TractionQuery): Promise<Traction> {
  const house = q.house.map((a) => a.toLowerCase());
  const vaults = q.vaults.map((a) => a.toLowerCase());
  const products = q.products.map((a) => a.toLowerCase());
  const since = q.nowSec - DAY_SEC;
  // One CTE chain: the fills with their two sides, each side resolved to a wallet (or a product), then the aggregates.
  const sides = sql`
    with f as (
      select f.tx_hash, f.log_index, f.market, f.ts_sec, f.taker, f.maker, f.taker_kind, f.path, f.lots, coalesce(s.cash_unit, 1) as cash_unit,
        case when f.taker_kind in (0, 1) then f.price_ticks else ${PAIR_TICKS} - f.price_ticks end as taker_px,
        f.taker = any(${house as string[]}::text[]) as taker_house, f.maker = any(${house as string[]}::text[]) as maker_house,
        m.symbol, m.cadence_sec
      from idx_fills f join idx_markets m on m.market = f.market left join idx_series s on s.series = m.series
    ),
    calls as (select * from f where not (taker_house and maker_house)),
    raw as (
      select tx_hash, log_index, market, ts_sec, symbol, cadence_sec, taker as party, taker_kind as kind, lots * taker_px * cash_unit as cash_base
      from calls where not taker_house
      union all
      select tx_hash, log_index, market, ts_sec, symbol, cadence_sec, maker,
        case when path in (0, 1) then (case taker_kind when 0 then 1 when 1 then 0 when 2 then 3 else 2 end)
             else (case taker_kind when 0 then 2 when 2 then 0 when 1 then 3 else 1 end) end,
        lots * (case when path in (0, 1) then taker_px else ${PAIR_TICKS} - taker_px end) * cash_unit
      from calls where not maker_house
    ),
    sides as (
      select r.*, r.party = any(${products as string[]}::text[]) as via_product,
        case when r.party = any(${vaults as string[]}::text[]) then e.owner when r.party = any(${products as string[]}::text[]) then null else r.party end as wallet
      from raw r left join lateral (
        select x.owner from idx_vault_executions x where x.tx_hash = r.tx_hash and x.market = r.market and r.party = any(${vaults as string[]}::text[]) limit 1
      ) e on true
    )`;

  const [totals] = await sql`${sides},
    firsts as (select wallet, min(ts_sec) as first_sec from sides where wallet is not null group by wallet)
    select (select count(*) from firsts)::int as wallets,
      (select count(distinct wallet) from sides where wallet is not null and ts_sec >= ${since})::int as wallets_24h,
      (select count(*) from calls)::int as calls,
      (select count(*) from calls where ts_sec >= ${since})::int as calls_24h,
      (select count(*) from sides where via_product)::int as unattributed,
      (select coalesce(sum(cash_base), 0)::text from sides) as traded_base,
      (select count(*) from f where taker_house and maker_house)::int as house_fills,
      (select json_agg(json_build_object('day', d, 'n', n) order by d) from (select floor(first_sec / ${DAY_SEC})::int as d, count(*)::int as n from firsts group by 1) w) as new_by_day,
      (select json_agg(json_build_object('day', d, 'n', n) order by d) from (select floor(ts_sec / ${DAY_SEC})::int as d, count(*)::int as n from calls group by 1) c) as calls_by_day`;

  const recent = await sql`${sides}
    select tx_hash, ts_sec::text, wallet, kind, symbol, cadence_sec, cash_base::text from sides
    order by ts_sec desc, log_index desc limit ${Math.max(1, Math.min(50, q.recent ?? 12))}`;

  const [venue] = await sql`
    select (select count(*) from idx_markets where opened_tx is not null)::int as opened,
      (select count(*) from idx_markets where state = 'resolved')::int as resolved,
      (select count(*) from idx_markets where state = 'voided')::int as voided,
      (select count(*) from idx_markets where state = 'open' and opened_tx is not null)::int as open,
      (select count(*) from idx_prints)::int as prints,
      ((select coalesce(sum(total_base), 0) from idx_redemptions
          where holder <> all(${[...house, ...vaults, ...products]}::text[]))
        + (select coalesce(sum(payout_base), 0) from idx_vault_settlements))::text as paid_base`;

  const t = totals!;
  const v = venue!;
  return {
    wallets: Number(t.wallets),
    wallets24h: Number(t.wallets_24h),
    calls: Number(t.calls),
    calls24h: Number(t.calls_24h),
    unattributed: Number(t.unattributed),
    tradedBase: String(t.traded_base),
    paidBase: String(v.paid_base),
    houseFills: Number(t.house_fills),
    windowsOpened: Number(v.opened),
    windowsResolved: Number(v.resolved),
    windowsVoided: Number(v.voided),
    windowsOpen: Number(v.open),
    prints: Number(v.prints),
    days: everyDay(t.new_by_day as DayCount[] | null, t.calls_by_day as DayCount[] | null, Math.floor(q.nowSec / DAY_SEC)),
    recent: recent.map((r) => ({
      txHash: String(r.tx_hash),
      tsSec: Number(r.ts_sec),
      wallet: (r.wallet as string | null) ?? null,
      kind: Number(r.kind),
      symbol: String(r.symbol),
      cadenceSec: Number(r.cadence_sec),
      cashBase: String(r.cash_base).split(".")[0]!,
    })),
  };
}

type DayCount = { day: number; n: number };

/** Every UTC day from the first call to today, with zero-filled gaps (a quiet day is a real zero). */
export function everyDay(newByDay: DayCount[] | null, callsByDay: DayCount[] | null, today: number): Traction["days"] {
  const wallets = new Map((newByDay ?? []).map((d) => [d.day, d.n]));
  const calls = new Map((callsByDay ?? []).map((d) => [d.day, d.n]));
  const known = [...wallets.keys(), ...calls.keys()];
  if (!known.length) return [];
  const first = Math.min(...known);
  const last = Math.max(today, ...known);
  const out: Traction["days"] = [];
  for (let day = first; day <= last; day++) out.push({ day, newWallets: wallets.get(day) ?? 0, calls: calls.get(day) ?? 0 });
  return out;
}
