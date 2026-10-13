-- The bridge's Tempo side in the index (R4-12, D-227; S14 14o; fixes the bug that left `stocks` "not indexed"): every
-- TIP20MintBurnAdapter event that moves a mirror — `OFTSent` (burned out), `OFTReceived` (credited in), `CreditDeferred`
-- (held: claim or send back), `DeferredClaimed`, `DeferredSent` — one row each, from the adapters' deploy blocks. Like the
-- vault's (index/0002) these carry no engine `seq` and live in idx_events with `market` NULL, each applied exactly once.
-- Derived and rebuildable. Amounts are the mirror's 6-dp units (NUMERIC). `account` is the holder the event names
-- (sender out, recipient in); `eid` the other side's LayerZero endpoint id when the event has one.
create table if not exists idx_bridge_events (
  tx_hash         text     not null,
  log_index       integer  not null,
  adapter         text     not null,
  name            text     not null check (name in ('OFTSent', 'OFTReceived', 'CreditDeferred', 'DeferredClaimed', 'DeferredSent')),
  guid            text,
  account         text     not null,
  eid             integer,
  amount_sd       numeric  not null,
  reason          integer,
  block_number    bigint   not null,
  block_time_sec  bigint   not null,
  primary key (tx_hash, log_index)
);
create index if not exists idx_bridge_events_account on idx_bridge_events (account, block_number desc);
create index if not exists idx_bridge_events_guid on idx_bridge_events (guid) where guid is not null;
