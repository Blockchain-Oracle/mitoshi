-- Spot ticks behind /prices/history and the stream snapshot (plan C.4.6; 30-day retention, pruned by ops hourly).
create table if not exists price_ticks (
  symbol       text     not null,
  source       text     not null check (source in ('redstone', 'datastreams')),
  publish_sec  bigint   not null,
  price_e8     numeric  not null,
  signers      smallint not null,
  primary key (symbol, source, publish_sec)
);
create index if not exists price_ticks_time_idx on price_ticks (publish_sec desc);

-- Re-verification cache for /proof (plan C.4.4): one row per recorded print once a browser-side eth_call re-verify agreed.
-- Replaces Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:packages/db/src/schema-proofs.ts (a Pyth replay record): on Tempo every
-- print is re-verified by `eth_call` against its verifier, so the cache keys by market slot.
create table if not exists print_proofs (
  chain_id        integer  not null,
  market          text     not null,
  which           smallint not null check (which between 0 and 3),
  tx_hash         text     not null,
  source          smallint not null,
  price_e8        numeric  not null,
  source_ts_sec   bigint   not null,
  verified        boolean  not null,
  detail          jsonb    not null default '{}'::jsonb,
  checked_at      timestamptz not null default now(),
  primary key (chain_id, market, which)
);
