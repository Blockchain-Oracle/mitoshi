-- The launchpads in the index (R6 money, S02 + S08; D-230): every launch the LaunchRegistry records, every curve trade
-- and graduated-pool swap, and every holder's balance from the launched tokens' own Transfer logs — so /launch and
-- /launch/<token> answer from one request instead of a browser log scan. The indexer follows the launchpad, the registry,
-- the tokens' transfers and the graduated pools on their own cursors (idx_cursor), stores each log once in idx_events
-- (`market` NULL, applied exactly once) and applies it here. Derived and rebuildable: truncate and replay from the
-- launch area's deploy block. Amounts are base units, prices pathUSD per coin at 1e18 (NUMERIC, never floats). Quotes
-- and trades read the chain head-fresh; the index never gates a write.

create table if not exists idx_launches (
  token            text     primary key,
  kind             text     not null check (kind in ('memecoin', 'stablecoin')),
  creator          text     not null,
  name             text,
  symbol           text,
  logo_uri         text,
  metadata_uri     text,
  decimals         smallint,
  total_supply     numeric,
  config_id        integer,
  threshold_quote  numeric,
  created_block    bigint   not null,
  created_sec      bigint   not null,
  stage            text     not null default 'trading' check (stage in ('trading', 'complete', 'graduated')),
  last_price_e18   numeric,
  quote_reserve    numeric  not null default 0,
  coin_sold        numeric  not null default 0,
  completed_sec    bigint,
  graduated_sec    bigint,
  pool_id          text
);
create index if not exists idx_launches_created_idx on idx_launches (created_sec desc);
create index if not exists idx_launches_pool_idx on idx_launches (pool_id) where pool_id is not null;

-- Every trade: the curve's `Trade` and, after graduation, the Uniswap v4 pool's `Swap` (so a graduated coin keeps its
-- volume and price). `quote_base` pathUSD, `coin_raw` the coin, both base units.
create table if not exists idx_launch_trades (
  tx_hash         text     not null,
  log_index       integer  not null,
  token           text     not null,
  trader          text     not null,
  is_buy          boolean  not null,
  quote_base      numeric  not null,
  coin_raw        numeric  not null,
  fee_base        numeric  not null default 0,
  price_e18       numeric  not null,
  quote_reserve   numeric,
  venue           text     not null check (venue in ('curve', 'pool')),
  block_number    bigint   not null,
  block_time_sec  bigint   not null,
  primary key (tx_hash, log_index)
);
create index if not exists idx_launch_trades_token_idx on idx_launch_trades (token, block_number desc, log_index desc);
create index if not exists idx_launch_trades_time_idx on idx_launch_trades (block_time_sec);

-- Every holder's balance, moved by the token's own Transfer logs (mint from 0x0, burn to 0x0).
create table if not exists idx_launch_balances (
  token        text     not null,
  holder       text     not null,
  balance_raw  numeric  not null default 0,
  primary key (token, holder)
);
create index if not exists idx_launch_balances_rank_idx on idx_launch_balances (token, balance_raw desc);
