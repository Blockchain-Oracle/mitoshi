-- Two Trading Balances on one chain (S24.2, D-193): EventVault v1 and EventVaultV2 (the EXIT grant). Grants are numbered
-- per vault and an owner has a balance in each, so every vault projection is keyed by the vault as well. The
-- projections are derived (index/0002), so they are recreated empty and both vaults are replayed from their deploy
-- blocks: the stored vault logs and their cursors go too (vault events are the only ones with these names and no
-- market — the engine emits none of them).

drop table if exists idx_vault_accounts;
drop table if exists idx_vault_grants;
drop table if exists idx_vault_executions;
drop table if exists idx_vault_settlements;

delete from idx_cursor where address in (
  select distinct address from idx_events
  where market is null and name in ('Deposited', 'Credited', 'Withdrawn', 'PrivateMoved', 'PrivateCredited', 'PrivateWithdrawn',
    'GrantCreated', 'GrantFunded', 'GrantRevoked', 'Executed', 'Settled', 'Swept', 'ExitGranted')
);
delete from idx_events
where market is null and name in ('Deposited', 'Credited', 'Withdrawn', 'PrivateMoved', 'PrivateCredited', 'PrivateWithdrawn',
  'GrantCreated', 'GrantFunded', 'GrantRevoked', 'Executed', 'Settled', 'Swept', 'ExitGranted');

-- One row per vault and owner: the buckets as the events move them.
create table if not exists idx_vault_accounts (
  vault                   text     not null,
  owner                   text     not null,
  available_base          numeric  not null default 0,
  private_available_base  numeric  not null default 0,
  deposited_base          numeric  not null default 0,
  withdrawn_base          numeric  not null default 0,
  updated_block           bigint   not null,
  primary key (vault, owner)
);

-- Every grant ever created, per vault (a revoked or replaced grant stays for the trust surface's history). An EXIT grant
-- (kind 3, v2) has no budget and sells only at the fair-value floor less `exit_tolerance_bps`.
create table if not exists idx_vault_grants (
  vault                     text     not null,
  grant_id                  bigint   not null,
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
  exit_tolerance_bps        integer,
  created_tx                text     not null,
  created_block             bigint   not null,
  created_at_sec            bigint   not null,
  revoked_tx                text,
  revoked_at_sec            bigint,
  last_used_tx              text,
  last_used_at_sec          bigint,
  primary key (vault, grant_id)
);
create index if not exists idx_vault_grants_owner_idx on idx_vault_grants (owner, vault, grant_id desc);
create index if not exists idx_vault_grants_actor_idx on idx_vault_grants (actor);

-- Every fill a vault booked (`Executed`): the owner's own `place` (grant 0), a grant's actor (`placeFor`) or the exit
-- keeper (`exitFor`, v2).
create table if not exists idx_vault_executions (
  tx_hash       text      not null,
  log_index     integer   not null,
  vault         text      not null,
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
create index if not exists idx_vault_executions_market_idx on idx_vault_executions (market, vault, owner);
create index if not exists idx_vault_executions_owner_idx on idx_vault_executions (owner, at_sec desc);

-- Every crank that paid an owner's settled Window into their Trading Balance (`Settled`), per vault.
create table if not exists idx_vault_settlements (
  tx_hash       text     not null,
  log_index     integer  not null,
  vault         text     not null,
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
create index if not exists idx_vault_settlements_market_idx on idx_vault_settlements (market, vault, owner);
