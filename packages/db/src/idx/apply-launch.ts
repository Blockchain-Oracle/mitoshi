/**
 * Projection writes for one launchpad log (index/0010; R6 money S02 + S08, D-230): the LaunchRegistry's records (with the
 * token's own metadata, read once by the fetcher), the CurveLaunchpad's launches, trades, completion and graduation,
 * the launched tokens' Transfers (holders) and the graduated pools' Swaps. Runs inside the writer's DB transaction; the
 * logs are stored with `market` NULL, so each is applied exactly once, in (block, log index) order — the writer applies
 * an event only when its `idx_events` row is newly inserted, which is what makes a replayed window a no-op. A registry
 * record and its launchpad `LaunchCreated` land on separate cursors, so both upsert the same row in either order.
 */
import type postgres from "postgres";
import type { IdxEvent } from "./types";

type Tx = postgres.TransactionSql;
type Data = Record<string, unknown>;

export const LAUNCH_EVENTS: ReadonlySet<string> = new Set(["MemecoinRecorded", "StablecoinRecorded", "LaunchCreated", "Trade", "Completed", "Graduated", "Transfer", "Swap"]);

const ZERO = "0x0000000000000000000000000000000000000000";

const str = (d: Data, key: string): string => {
  const v = d[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  throw new Error(`launch event field ${key} missing`);
};
const opt = (d: Data | undefined, key: string): string | null => {
  const v = d?.[key];
  return v === undefined || v === null ? null : String(v);
};
const addr = (d: Data, key: string) => str(d, key).toLowerCase();
const abs = (v: string) => (v.startsWith("-") ? v.slice(1) : v);

async function recorded(tx: Tx, e: IdxEvent, kind: "memecoin" | "stablecoin") {
  const d = e.data;
  const m = (d.meta ?? undefined) as Data | undefined;
  await tx`
    insert into idx_launches (token, kind, creator, metadata_uri, name, symbol, logo_uri, decimals, total_supply, config_id, threshold_quote, created_block, created_sec)
    values (${addr(d, "token")}, ${kind}, ${addr(d, "creator")}, ${opt(d, "metadataURI")}, ${opt(m, "name")}, ${opt(m, "symbol")}, ${opt(m, "logoURI")},
      ${opt(m, "decimals")}::smallint, ${opt(m, "totalSupply")}::numeric, ${opt(m, "configId")}::integer, ${opt(m, "thresholdQuote")}::numeric, ${e.blockNumber}, ${e.blockTimeSec})
    on conflict (token) do update set
      kind = excluded.kind, creator = excluded.creator, metadata_uri = excluded.metadata_uri,
      name = coalesce(excluded.name, idx_launches.name), symbol = coalesce(excluded.symbol, idx_launches.symbol), logo_uri = coalesce(excluded.logo_uri, idx_launches.logo_uri),
      decimals = coalesce(excluded.decimals, idx_launches.decimals), total_supply = coalesce(excluded.total_supply, idx_launches.total_supply),
      config_id = coalesce(excluded.config_id, idx_launches.config_id), threshold_quote = coalesce(excluded.threshold_quote, idx_launches.threshold_quote)`;
}

async function launchCreated(tx: Tx, e: IdxEvent) {
  const d = e.data;
  await tx`
    insert into idx_launches (token, kind, creator, symbol, config_id, created_block, created_sec)
    values (${addr(d, "token")}, 'memecoin', ${addr(d, "creator")}, ${opt(d, "symbol")}, ${opt(d, "configId")}::integer, ${e.blockNumber}, ${e.blockTimeSec})
    on conflict (token) do update set config_id = coalesce(idx_launches.config_id, excluded.config_id), symbol = coalesce(idx_launches.symbol, excluded.symbol)`;
}

async function trade(tx: Tx, e: IdxEvent, venue: "curve" | "pool") {
  const d = e.data;
  const token = addr(d, "token");
  const isBuy = d.isBuy === true;
  // The fetcher states both venues alike: pathUSD in, coin out (a pool swap's signed deltas are folded there).
  const quote = abs(str(d, "quote"));
  const coin = abs(str(d, "coin"));
  const price = str(d, "priceE18");
  await tx`
    insert into idx_launch_trades (tx_hash, log_index, token, trader, is_buy, quote_base, coin_raw, fee_base, price_e18, quote_reserve, venue, block_number, block_time_sec)
    values (${e.txHash}, ${e.logIndex}, ${token}, ${addr(d, "trader")}, ${isBuy}, ${quote}::numeric, ${coin}::numeric, ${opt(d, "fee") ?? "0"}::numeric, ${price}::numeric,
      ${venue === "curve" ? str(d, "quoteReserve") : null}::numeric, ${venue}, ${e.blockNumber}, ${e.blockTimeSec})
    on conflict do nothing`;
  if (venue === "curve") {
    await tx`
      update idx_launches set last_price_e18 = ${price}::numeric, quote_reserve = ${str(d, "quoteReserve")}::numeric,
        coin_sold = coin_sold + ${isBuy ? coin : `-${coin}`}::numeric
      where token = ${token}`;
  } else {
    await tx`update idx_launches set last_price_e18 = ${price}::numeric where token = ${token}`;
  }
}

async function transfer(tx: Tx, e: IdxEvent) {
  const d = e.data;
  const token = addr(d, "token");
  const amount = str(d, "amount");
  const from = addr(d, "from");
  const to = addr(d, "to");
  if (from !== ZERO) {
    await tx`
      insert into idx_launch_balances (token, holder, balance_raw) values (${token}, ${from}, ${`-${amount}`}::numeric)
      on conflict (token, holder) do update set balance_raw = idx_launch_balances.balance_raw - ${amount}::numeric`;
  }
  if (to !== ZERO) {
    await tx`
      insert into idx_launch_balances (token, holder, balance_raw) values (${token}, ${to}, ${amount}::numeric)
      on conflict (token, holder) do update set balance_raw = idx_launch_balances.balance_raw + ${amount}::numeric`;
  }
}

export async function applyLaunchEvent(tx: Tx, e: IdxEvent): Promise<void> {
  const d = e.data;
  switch (e.name) {
    case "MemecoinRecorded":
      return recorded(tx, e, "memecoin");
    case "StablecoinRecorded":
      return recorded(tx, e, "stablecoin");
    case "LaunchCreated":
      return launchCreated(tx, e);
    case "Trade":
      return trade(tx, e, "curve");
    case "Swap":
      return trade(tx, e, "pool");
    case "Completed":
      await tx`update idx_launches set stage = 'complete', quote_reserve = ${str(d, "quoteReserve")}::numeric, completed_sec = ${e.blockTimeSec} where token = ${addr(d, "token")} and stage = 'trading'`;
      return;
    case "Graduated":
      await tx`update idx_launches set stage = 'graduated', graduated_sec = ${e.blockTimeSec}, pool_id = ${opt(d, "poolId")} where token = ${addr(d, "token")}`;
      return;
    case "Transfer":
      return transfer(tx, e);
  }
}
