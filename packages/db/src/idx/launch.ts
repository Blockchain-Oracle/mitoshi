/**
 * The launchpads' reads (index/0010; R6 money S02 + S08, D-230): one launch — its facts, its last 500 trades and its
 * holders — and the board, each in one round of queries, for `/api/launch`. Holders exclude the curve (the launchpad),
 * the pool (PoolManager), the locker and the zero address from the count and label them in the list; the creator is
 * labelled too. `indexedTo` is the lowest of the launch followers' cursors, so a page can tell "no trades yet" from
 * "not indexed yet". Pure SQL over the index; amounts leave as decimal strings.
 */
import { graduationProgressBps, type IndexedTo, type LaunchBoardRowWire, type LaunchBoardWire, type LaunchFactsWire, type LaunchFeedWire, type LaunchHolderWire, type LaunchTradeWire } from "@cwf/core";
import type postgres from "postgres";

type Sql = postgres.Sql;

/** The addresses that hold supply without being holders, and the cursors that say how far the index has read. */
export interface LaunchSpecial {
  curve: string;
  pool: string;
  locker: string;
  /** idx_cursor addresses of the launch followers. */
  cursors: readonly string[];
}

const TRADES = 500;
const TOP_HOLDERS = 20;
const SPARK = 48;
const DAY = 86_400;
const E18 = 10n ** 18n;
const ZERO = "0x0000000000000000000000000000000000000000";

type LaunchRow = {
  token: string; kind: "memecoin" | "stablecoin"; creator: string; name: string | null; symbol: string | null; logo_uri: string | null; decimals: number | null;
  total_supply: string | null; threshold_quote: string | null; created_block: string; created_sec: string; stage: LaunchFactsWire["stage"];
  last_price_e18: string | null; quote_reserve: string; coin_sold: string; graduated_sec: string | null; pool_id: string | null;
};

const factsOf = (r: LaunchRow): LaunchFactsWire => ({
  token: r.token, kind: r.kind, creator: r.creator, name: r.name, symbol: r.symbol, logoURI: r.logo_uri, decimals: r.decimals, totalSupply: r.total_supply,
  thresholdQuote: r.threshold_quote, createdBlock: Number(r.created_block), createdSec: Number(r.created_sec), stage: r.stage, priceE18: r.last_price_e18,
  quoteReserve: r.quote_reserve, coinSold: r.coin_sold, graduatedSec: r.graduated_sec === null ? null : Number(r.graduated_sec), poolId: r.pool_id,
});

const COLS = `token, kind, creator, name, symbol, logo_uri, decimals, total_supply::text, threshold_quote::text, created_block::text, created_sec::text, stage,
  last_price_e18::text, quote_reserve::text, coin_sold::text, graduated_sec::text, pool_id`;

async function indexedTo(sql: Sql, cursors: readonly string[]): Promise<IndexedTo | null> {
  if (cursors.length === 0) return null;
  const rows = await sql<{ block: string; updated_at_ms: string }[]>`select block::text, updated_at_ms::text from idx_cursor where address = any(${cursors.map((c) => c.toLowerCase())}::text[])`;
  if (rows.length < cursors.length) return null;
  const low = rows.reduce((a, b) => (Number(b.block) < Number(a.block) ? b : a));
  return { block: Number(low.block), atSec: Math.floor(Number(low.updated_at_ms) / 1000) };
}

const excluded = (s: LaunchSpecial) => [s.curve, s.pool, s.locker, ZERO].map((a) => a.toLowerCase());

export async function readLaunchFeed(sql: Sql, token: string, special: LaunchSpecial): Promise<LaunchFeedWire> {
  const t = token.toLowerCase();
  const out = excluded(special);
  const [[launch], trades, top, [count], to] = await Promise.all([
    sql.unsafe<LaunchRow[]>(`select ${COLS} from idx_launches where token = $1`, [t]),
    sql<{ tx_hash: string; log_index: number; trader: string; is_buy: boolean; quote_base: string; coin_raw: string; price_e18: string; venue: "curve" | "pool"; block_number: string; block_time_sec: string }[]>`
      select tx_hash, log_index, trader, is_buy, quote_base::text, coin_raw::text, price_e18::text, venue, block_number::text, block_time_sec::text
      from idx_launch_trades where token = ${t} order by block_number desc, log_index desc limit ${TRADES}`,
    sql<{ holder: string; balance_raw: string }[]>`
      select holder, balance_raw::text from idx_launch_balances where token = ${t} and balance_raw > 0 order by balance_raw desc limit ${TOP_HOLDERS}`,
    sql<{ n: number }[]>`select count(*)::int as n from idx_launch_balances where token = ${t} and balance_raw > 0 and holder <> all(${out}::text[])`,
    indexedTo(sql, special.cursors),
  ]);
  const creator = launch?.creator ?? null;
  const labelOf = (h: string): LaunchHolderWire["label"] => (h === special.curve.toLowerCase() ? "curve" : h === special.pool.toLowerCase() || h === special.locker.toLowerCase() ? "pool" : h === creator ? "creator" : null);
  return {
    launch: launch ? factsOf(launch) : null,
    trades: trades.reverse().map((r): LaunchTradeWire => ({
      txHash: r.tx_hash, logIndex: r.log_index, trader: r.trader, isBuy: r.is_buy, quoteBase: r.quote_base, coinRaw: r.coin_raw, priceE18: r.price_e18,
      venue: r.venue, blockNumber: Number(r.block_number), atSec: Number(r.block_time_sec),
    })),
    holders: { count: count?.n ?? 0, top: top.map((h) => ({ holder: h.holder, balanceRaw: h.balance_raw, label: labelOf(h.holder) })) },
    indexedTo: to,
  };
}

export interface BoardQuery {
  /** Team keys (lower-case): their launches are `team`. */
  team: readonly string[];
  includeTeam: boolean;
  nowSec: number;
}

export async function readLaunchBoard(sql: Sql, q: BoardQuery, special: LaunchSpecial): Promise<LaunchBoardWire> {
  const out = excluded(special);
  const since = q.nowSec - DAY;
  const [launches, day, holders, sparks, to] = await Promise.all([
    sql.unsafe<LaunchRow[]>(`select ${COLS} from idx_launches order by created_sec desc`),
    sql<{ token: string; vol: string; n: number }[]>`select token, sum(quote_base)::text as vol, count(*)::int as n from idx_launch_trades where block_time_sec >= ${since} group by token`,
    sql<{ token: string; n: number }[]>`select token, count(*)::int as n from idx_launch_balances where balance_raw > 0 and holder <> all(${out}::text[]) group by token`,
    sql<{ token: string; prices: string[] }[]>`
      select token, array_agg(price_e18::text order by block_number, log_index) as prices from (
        select token, price_e18, block_number, log_index, row_number() over (partition by token order by block_number desc, log_index desc) as k from idx_launch_trades
      ) x where k <= ${SPARK} group by token`,
    indexedTo(sql, special.cursors),
  ]);
  const team = new Set(q.team.map((a) => a.toLowerCase()));
  const dayOf = new Map(day.map((d) => [d.token, d]));
  const holdersOf = new Map(holders.map((h) => [h.token, h.n]));
  const sparkOf = new Map(sparks.map((s) => [s.token, s.prices]));
  const all = launches.map((r): LaunchBoardRowWire => {
    const price = r.last_price_e18 === null ? null : BigInt(r.last_price_e18);
    const supply = r.total_supply === null ? null : BigInt(r.total_supply);
    const reserve = BigInt(r.quote_reserve);
    const threshold = r.threshold_quote === null ? 0n : BigInt(r.threshold_quote);
    return {
      token: r.token, kind: r.kind, name: r.name, symbol: r.symbol, logoURI: r.logo_uri, creator: r.creator, team: team.has(r.creator), createdSec: Number(r.created_sec),
      stage: r.stage, progressBps: r.kind === "stablecoin" ? 0 : r.stage === "trading" ? graduationProgressBps(reserve, threshold) : 10_000,
      priceE18: r.last_price_e18, mcapBase: price !== null && supply !== null ? ((supply * price) / E18).toString() : null, totalSupply: r.total_supply,
      vol24hBase: dayOf.get(r.token)?.vol ?? "0", trades24h: dayOf.get(r.token)?.n ?? 0, holders: holdersOf.get(r.token) ?? 0, spark: sparkOf.get(r.token) ?? [],
      raisedBase: r.stage === "trading" ? reserve.toString() : (threshold > reserve ? threshold : reserve).toString(), graduatedSec: r.graduated_sec === null ? null : Number(r.graduated_sec),
    };
  });
  const rows = q.includeTeam ? all : all.filter((r) => !r.team);
  const trading = rows.filter((r) => r.kind === "memecoin" && r.stage === "trading").sort((a, b) => b.progressBps - a.progressBps)[0] ?? null;
  return {
    rows,
    head: {
      count: rows.length,
      raisedBase: rows.filter((r) => r.kind === "memecoin").reduce((s, r) => s + BigInt(r.raisedBase), 0n).toString(),
      top: trading ? { token: trading.token, symbol: trading.symbol, progressBps: trading.progressBps } : null,
    },
    teamCount: all.filter((r) => r.team).length,
    indexedTo: to,
  };
}
