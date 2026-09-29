-- The relay's sponsorship ledger (plan C.3.3, C.4.6): one row per co-signed raw transaction; budgets are counted here
-- so every web instance shares them (Masayume's in-process counters broke across instances).
create table if not exists relay_sponsorships (
  id bigserial primary key,
  chain_id integer not null,
  area text not null,
  sender text not null,
  device text,
  method text not null,
  fee_micros numeric(38, 0) not null default 0,
  tx_hash text,
  created_at_sec bigint not null
);
create index if not exists relay_sponsorships_sender_time on relay_sponsorships (lower(sender), created_at_sec);
create index if not exists relay_sponsorships_device_time on relay_sponsorships (device, created_at_sec);
create index if not exists relay_sponsorships_time on relay_sponsorships (created_at_sec);
