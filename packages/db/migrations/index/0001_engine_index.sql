-- The engine indexer's raw events, projections and cursors (plan C.4.1–C.4.2, D-030). Ported from Agari
-- 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:packages/db/src/schema-index.ts: Solana signatures/slots/seats become
-- (chain_id, tx_hash, log_index)/block numbers/addresses; Books, Ledgers and mvaults are gone (one engine, A.1).
-- Everything here is derived from chain and rebuildable: truncate and replay from the deploy block. Amounts are exact
-- integers (NUMERIC), never floats. `*_base` = pathUSD base units as the chain moved them; `*_ticklots` = lots × YES
-- ticks; base units = ticklots × the Series cash unit (engine §1; 1 on the launch grid).
-- Ordering: a Market's projections apply in `seq` order; the writer rebuilds a Market whose events arrive out of order
-- or with a hole in `seq` (C.4.1 gaps.ts).

-- Per (chain, contract) cursor: every log at or below `block` is indexed (Tempo finalizes each block: no reorgs).
create table if not exists idx_cursor (
  chain_id       integer not null,
  address        text    not null,
  block          bigint  not null,
  updated_at_ms  bigint  not null,
  primary key (chain_id, address)
);

-- Every decoded log of a source, JSON-safe (bigints as decimal strings). Insert-once: ON CONFLICT DO NOTHING RETURNING
-- decides whether projections apply, so a replayed window is a no-op.
create table if not exists idx_events (
  chain_id        integer  not null,
  tx_hash         text     not null,
  log_index       integer  not null,
  block_number    bigint   not null,
  block_time_sec  bigint   not null,
  address         text     not null,
  name            text     not null,
  market          text,
  seq             bigint,
  data            jsonb    not null,
  primary key (chain_id, tx_hash, log_index)
);
create index if not exists idx_events_market_seq_idx on idx_events (market, seq);
create index if not exists idx_events_name_idx on idx_events (name, block_number desc);
create index if not exists idx_events_block_idx on idx_events (chain_id, block_number);

-- Series facts from `SeriesRegistered` (and the lens on first sight of a Window, for Series registered before the cursor).
create table if not exists idx_series (
  series       text     primary key,
  ticker       integer  not null,
  symbol       text,
  cadence_sec  integer  not null,
  basis        smallint not null,
  lot_base     numeric  not null,
  tick_base    numeric  not null,
  cash_unit    numeric  not null
);

-- One row per Window, created by `WindowOpened`; later events only update it.
create table if not exists idx_markets (
  market              text     primary key,
  series              text,
  symbol              text,
  cadence_sec         integer,
  basis               smallint,
  market_index        bigint,
  m_idx               integer,
  trading_start_sec   bigint,
  lock_at_sec         bigint,
  expiry_sec          bigint,
  open_deadline_sec   bigint,
  close_deadline_sec  bigint,
  policy_version      smallint,
  open_kind           smallint,
  close_kind          smallint,
  opened_tx           text,
  opened_block_time_sec bigint,
  state               text     not null default 'open' check (state in ('open', 'resolved', 'voided')),
  -- 0 Yes (Up), 1 No (Down), 2 Void.
  winner              smallint,
  payout_yes          bigint,
  payout_no           bigint,
  void_reason         smallint,
  single_source       boolean,
  open_e8             bigint,
  close_e8            bigint,
  resolved_ts_sec     bigint,
  resolved_tx         text,
  backing_lots        numeric  not null default 0,
  volume_lots         numeric  not null default 0,
  volume_ticklots     numeric  not null default 0,
  trade_count         bigint   not null default 0,
  last_price_ticks    smallint,
  last_trade_sec      bigint,
  last_seq            bigint   not null default 0,
  last_block          bigint   not null default 0
);
create index if not exists idx_markets_series_idx on idx_markets (series, market_index desc);
create index if not exists idx_markets_expiry_idx on idx_markets (expiry_sec desc);
create index if not exists idx_markets_state_idx on idx_markets (state, expiry_sec);

-- Recorded prints at expo −8. which: 0 open, 1 close, 2 check open, 3 check close.
create table if not exists idx_prints (
  market           text     not null,
  which            smallint not null,
  source           smallint not null,
  price_e8         bigint   not null,
  source_ts_sec    bigint   not null,
  signers          smallint not null,
  copied           boolean  not null,
  recorded_ts_sec  bigint   not null,
  tx_hash          text     not null,
  primary key (market, which)
);

-- One row per placement (`OrderExecuted`); a resting remainder is tracked by its order id until filled, cancelled,
-- expired, swept or drained by a redeem (OrderRemoved reason 0..5).
create table if not exists idx_orders (
  chain_id           integer  not null,
  tx_hash            text     not null,
  log_index          integer  not null,
  market             text     not null,
  seq                bigint   not null,
  ts_sec             bigint   not null,
  owner              text     not null,
  -- 0 BUY_YES, 1 SELL_YES, 2 BUY_NO, 3 SELL_NO; order_type 0 Normal, 1 FOK, 2 IOC, 3 PostOnly.
  kind               smallint not null,
  order_type         smallint not null,
  limit_price        smallint not null,
  lots               numeric  not null,
  expire_ts_sec      bigint   not null,
  client_id          numeric  not null,
  filled_lots        numeric  not null,
  cash_spent_base    numeric  not null,
  cash_received_base numeric  not null,
  cancelled_lots     numeric  not null,
  stop_reason        smallint not null,
  rested_order_id    numeric,
  rested_lots        numeric  not null,
  remaining_lots     numeric  not null,
  status             text     not null check (status in ('done', 'open', 'filled', 'cancelled', 'expired')),
  removed_reason     smallint,
  updated_seq        bigint   not null,
  primary key (chain_id, tx_hash, log_index)
);
create index if not exists idx_orders_rested_idx on idx_orders (market, rested_order_id) where rested_order_id is not null;
create index if not exists idx_orders_owner_idx on idx_orders (owner, ts_sec desc);

-- One row per `Fill`. price_ticks is the maker's price in YES terms; a NO leg's price is 1000 − price_ticks.
create table if not exists idx_fills (
  chain_id         integer  not null,
  tx_hash          text     not null,
  log_index        integer  not null,
  market           text     not null,
  seq              bigint   not null,
  block_number     bigint   not null,
  ts_sec           bigint   not null,
  taker            text     not null,
  taker_kind       smallint not null,
  maker            text     not null,
  maker_kind       smallint not null,
  maker_order_id   numeric  not null,
  -- 0 DIRECT_YES, 1 DIRECT_NO, 2 MINT_PAIR, 3 BURN_PAIR.
  path             smallint not null,
  price_ticks      smallint not null,
  lots             numeric  not null,
  maker_remaining  numeric  not null,
  primary key (chain_id, tx_hash, log_index)
);
create index if not exists idx_fills_market_idx on idx_fills (market, seq desc, log_index desc);
create index if not exists idx_fills_taker_idx on idx_fills (taker, ts_sec desc);
create index if not exists idx_fills_maker_idx on idx_fills (maker, ts_sec desc);
create index if not exists idx_fills_ts_idx on idx_fills (ts_sec desc);

-- What each wallet holds and moved in one Window: fills (both sides), complete sets, credit withdrawals, redemption.
create table if not exists idx_positions (
  market              text    not null,
  owner               text    not null,
  yes_lots            numeric not null default 0,
  no_lots             numeric not null default 0,
  bought_yes_lots     numeric not null default 0,
  sold_yes_lots       numeric not null default 0,
  bought_no_lots      numeric not null default 0,
  sold_no_lots        numeric not null default 0,
  paid_ticklots       numeric not null default 0,
  received_ticklots   numeric not null default 0,
  minted_lots         numeric not null default 0,
  merged_lots         numeric not null default 0,
  set_paid_base       numeric not null default 0,
  set_received_base   numeric not null default 0,
  withdrawn_base      numeric not null default 0,
  redeemed_base       numeric not null default 0,
  payout_base         numeric not null default 0,
  held_credit_base    numeric not null default 0,
  redeemed            boolean not null default false,
  redeemed_by_crank   boolean not null default false,
  fills               integer not null default 0,
  first_ts_sec        bigint,
  last_ts_sec         bigint,
  entry_tx            text,
  last_tx             text,
  primary key (market, owner)
);
create index if not exists idx_positions_owner_idx on idx_positions (owner, last_ts_sec desc);
create index if not exists idx_positions_unredeemed_idx on idx_positions (market) where not redeemed;

-- 1-minute candles per Window from fills, YES-terms ticks.
create table if not exists idx_candles (
  market        text     not null,
  bucket_sec    bigint   not null,
  open_ticks    smallint not null,
  high_ticks    smallint not null,
  low_ticks     smallint not null,
  close_ticks   smallint not null,
  volume_lots   numeric  not null,
  trades        integer  not null,
  primary key (market, bucket_sec)
);

-- Added for Tempo (C.4.2): every `Redeemed` (own, partial, or a crank's `redeemFor`), with the pay-or-hold outcome.
create table if not exists idx_redemptions (
  chain_id        integer  not null,
  tx_hash         text     not null,
  log_index       integer  not null,
  market          text     not null,
  holder          text     not null,
  by_address      text     not null,
  yes_lots        numeric  not null,
  no_lots         numeric  not null,
  payout_base     numeric  not null,
  credit_base     numeric  not null,
  total_base      numeric  not null,
  is_partial      boolean  not null,
  held_as_credit  boolean  not null,
  ts_sec          bigint   not null,
  primary key (chain_id, tx_hash, log_index)
);
create index if not exists idx_redemptions_holder_idx on idx_redemptions (holder, ts_sec desc);

-- Per (market, holder): credit the engine holds for a wallet (a payout held under a receive policy, P12), net of
-- `CreditWithdrawn`. Claimables list reads it; the chain (`creditOf`) stays the write gate.
create table if not exists idx_credits (
  market        text    not null,
  holder        text    not null,
  held_base     numeric not null default 0,
  withdrawn_base numeric not null default 0,
  primary key (market, holder)
);

-- Engine-wide facts that are not market-scoped (RollerSet, ModeSet, CrankOptOutSet, NodesReserved, SurplusSwept, …)
-- stay in idx_events; opt-outs get their own row for the settler and /status.
create table if not exists idx_crank_opt_outs (
  holder       text    primary key,
  opted_out    boolean not null,
  block_number bigint  not null
);
