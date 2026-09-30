-- The EventVault's projections (plan C.4.2 `idx_vault_{accounts,grants,executions,settlements}`; S7). The indexer
-- follows the vault's address with its own cursor (idx_cursor) and stores every vault log in idx_events with
-- `market` NULL (a vault event carries no engine `seq`, and must never be replayed by a Window rebuild), so each
-- projection below is applied exactly once, in (block, log index) order. Derived and rebuildable: truncate and replay
-- from the vault's deploy block. Amounts are pathUSD base units as the chain moved them (NUMERIC, never floats).
-- The chain stays the truth for money on screen (the provider reads `accountOf`); these tables are for discovery (which
-- owners hold which Windows — the settler's crank worklist), history (grants, taps, settlements) and stats.

-- One row per owner: the buckets as the events move them.
create table if not exists idx_vault_accounts (
  owner                   text     primary key,
  available_base          numeric  not null default 0,
  private_available_base  numeric  not null default 0,
  deposited_base          numeric  not null default 0,
  withdrawn_base          numeric  not null default 0,
  updated_block           bigint   not null
);

-- Every grant ever created (a revoked or replaced grant stays for attribution and the trust surface's history).
create table if not exists idx_vault_grants (
  grant_id                  bigint   primary key,
  owner                     text     not null,
  actor                     text     not null,
  kind                      smallint not null,
  max_stake_per_trade_base  numeric  not null,
  max_daily_spend_base      numeric  not null,
  max_open_positions        integer  not null,
  max_price_raw             numeric  not null,
  market                    text,
  expires_at_sec            bigint   not null,
  budget_base               numeric  not null,
  funded_base               numeric  not null default 0,
  spent_base                numeric  not null default 0,
  taps                      integer  not null default 0,
  revoked                   boolean  not null default false,
  returned_base             numeric,
  created_tx                text     not null,
  created_block             bigint   not null,
  created_at_sec            bigint   not null,
  revoked_tx                text,
  revoked_at_sec            bigint,
  last_used_tx              text,
  last_used_at_sec          bigint
);
create index if not exists idx_vault_grants_owner_idx on idx_vault_grants (owner, grant_id desc);
create index if not exists idx_vault_grants_actor_idx on idx_vault_grants (actor);

-- Every fill the vault booked (`Executed`): the owner's own `place` (grant 0) or a grant's actor (`placeFor`).
create table if not exists idx_vault_executions (
  tx_hash       text      not null,
  log_index     integer   not null,
  block_number  bigint    not null,
  owner         text      not null,
  market        text      not null,
  grant_id      bigint    not null,
  outcome_idx   smallint  not null,
  is_buy        boolean   not null,
  cash_delta    numeric   not null,
  token_delta   numeric   not null,
  actor         text      not null,
  at_sec        bigint    not null,
  primary key (tx_hash, log_index)
);
create index if not exists idx_vault_executions_market_idx on idx_vault_executions (market, owner);
create index if not exists idx_vault_executions_owner_idx on idx_vault_executions (owner, at_sec desc);

-- Every crank that paid an owner's settled Window into their Trading Balance (`Settled`).
create table if not exists idx_vault_settlements (
  tx_hash       text     not null,
  log_index     integer  not null,
  block_number  bigint   not null,
  owner         text     not null,
  market        text     not null,
  payout_base   numeric  not null,
  yes_redeemed  numeric  not null,
  no_redeemed   numeric  not null,
  settled_by    text     not null,
  at_sec        bigint   not null,
  primary key (tx_hash, log_index)
);
create index if not exists idx_vault_settlements_market_idx on idx_vault_settlements (market, owner);
