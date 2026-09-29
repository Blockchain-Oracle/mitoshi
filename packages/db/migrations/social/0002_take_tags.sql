-- Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:packages/db/src/schema-social.ts (S13's cashtags on takes).
create table if not exists take_tags (
  take_id  bigint not null references takes (id) on delete cascade,
  -- A registry ticker, upper case as the registry writes it (TSLA, GOOGL).
  symbol   text   not null,
  primary key (symbol, take_id)
);
create index if not exists take_tags_take_idx on take_tags (take_id);
