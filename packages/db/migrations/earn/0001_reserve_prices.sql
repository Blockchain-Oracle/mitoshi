-- Earn's reserve history (R6 money, S09; D-230): one row per reserve per sampled block — the reserve's own sheet as the
-- chain held it at that block (historical eth_call), written by the ops `reserve-pricer` (hourly from each reserve's
-- deploy block, then every 10 minutes). /earn draws its share-price line and "what $100 did" from these rows; the live
-- figure stays the chain's. Amounts and prices are base units / raw prices (NUMERIC, never floats). Rebuildable: truncate
-- and the pricer backfills again from the deploy blocks.
create table if not exists reserve_prices (
  reserve           text     not null,
  block_number      bigint   not null,
  at_sec            bigint   not null,
  share_price_raw   numeric  not null,
  total_value_base  numeric  not null,
  liquid_base       numeric  not null,
  committed_base    numeric  not null,
  supply_shares     numeric  not null,
  primary key (reserve, block_number)
);
create index if not exists reserve_prices_at_idx on reserve_prices (reserve, at_sec);
