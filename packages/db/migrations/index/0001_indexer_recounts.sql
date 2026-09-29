-- The hourly recount (plan C.4.3): per event of each deployed contract, the Tempo Indexer API / tidx count against our
-- own record over one closed block range: the chain's eth_getLogs now, `idx_events` once the S3 follower owns that table.
create table if not exists indexer_recounts (
  id             bigserial   primary key,
  run_at         timestamptz not null default now(),
  chain_id       integer     not null,
  via            text        not null,
  area           text        not null,
  contract       text        not null,
  address        text        not null,
  event          text        not null,
  topic0         text        not null,
  from_block     bigint      not null,
  to_block       bigint      not null,
  indexer_count  bigint      not null,
  local_count    bigint      not null,
  local_source   text        not null,
  match          boolean     not null
);
create index if not exists indexer_recounts_run_idx on indexer_recounts (run_at desc);
create index if not exists indexer_recounts_mismatch_idx on indexer_recounts (run_at desc) where not match;
