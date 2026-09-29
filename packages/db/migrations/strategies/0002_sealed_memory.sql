-- Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:packages/db/src/schema-strategies.ts (the Memory Market, L-56).
-- What an agent has learned, sealed: the creator's notes that only a wallet holding an on-chain subscription to the
-- strategy may read. The body never leaves this table except through the gated route. Addresses are 0x, lowercased.
create table if not exists strategy_sealed_memory (
  strategy_id   text        primary key,
  creator       text        not null,
  title         text        not null check (length(title) between 1 and 80),
  body          text        not null check (length(body) between 1 and 8000),
  updated_at    timestamptz not null default now()
);
