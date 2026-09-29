-- The account trust surface's keychain history (D-053): AccountKeychain events per account, folded into keys by
-- `@cwf/markets/keys`. `keychain_scans` records the contiguous block range already scanned per account, so a visit
-- scans only new blocks forward and continues backward toward genesis where it left off (Moderato caps eth_getLogs at
-- 100,000 blocks). Chain data only: nothing here is private.
create table if not exists keychain_scans (
  chain_id integer not null,
  account text not null,
  lo bigint not null,
  hi bigint not null,
  updated_at_ms bigint not null,
  primary key (chain_id, account)
);
create table if not exists keychain_events (
  chain_id integer not null,
  account text not null,
  block bigint not null,
  log_index integer not null,
  tx_hash text not null,
  name text not null,
  key_id text not null,
  token text,
  signature_type integer,
  expiry numeric,
  limit_value numeric,
  amount numeric,
  primary key (chain_id, block, log_index)
);
create index if not exists keychain_events_account on keychain_events (chain_id, account, block);
