-- The terminal's Activity (RV-81, §8 "Money"): every pathUSD Transfer from or to an account, folded into money moves by
-- `@cwf/markets` (`activityRows`). `transfer_scans` records the contiguous block range already scanned per account and
-- token, so a visit scans only new blocks forward and continues backward toward Mitoshi's first deployment where it left
-- off (Moderato caps eth_getLogs at 100,000 blocks). Chain data only: nothing here is private.
create table if not exists transfer_scans (
  chain_id integer not null,
  account text not null,
  token text not null,
  lo bigint not null,
  hi bigint not null,
  updated_at_ms bigint not null,
  primary key (chain_id, account, token)
);
create table if not exists wallet_transfers (
  chain_id integer not null,
  account text not null,
  token text not null,
  block bigint not null,
  log_index integer not null,
  tx_hash text not null,
  at_sec bigint,
  from_addr text not null,
  to_addr text not null,
  value numeric not null,
  primary key (chain_id, account, token, block, log_index)
);
create index if not exists wallet_transfers_recent on wallet_transfers (chain_id, account, token, block desc);
