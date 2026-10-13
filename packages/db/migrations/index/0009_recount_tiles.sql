-- R6 (D-230): the recount compares the blocks the hosted index holds, tile by tile. A tile is a fixed 20,000-block
-- stretch of history; its row says which blocks were compared, for which contracts, and which blocks the index lacked
-- then (re-compared once the index backfills them). Each `indexer_recounts` row now names its item kind and the blocks
-- it counted and skipped.
alter table indexer_recounts add column if not exists kind text not null default 'full';
alter table indexer_recounts add column if not exists held_blocks bigint not null default 0;
alter table indexer_recounts add column if not exists gap_blocks bigint not null default 0;

create table if not exists indexer_recount_tiles (
  chain_id    integer     not null,
  via         text        not null,
  tile_from   bigint      not null,
  from_block  bigint      not null,
  to_block    bigint      not null,
  addresses   text[]      not null,
  -- [["from", "to"], …] as decimal strings: the blocks in [from_block, to_block] still to compare.
  gaps        jsonb       not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (chain_id, via, tile_from)
);
