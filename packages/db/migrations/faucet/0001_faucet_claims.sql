-- Test-funds claims on Moderato (plan C.3.4, L-25): one funding per wallet per cooldown, per-IP and global daily caps.
-- `auth` records how the claim was authorised: a signed challenge, or the passkey session of the one-ceremony sign-up.
create table if not exists faucet_challenges (
  id text primary key,
  wallet text not null,
  ip_hash text not null,
  message text not null,
  created_at_ms bigint not null,
  expires_at_ms bigint not null,
  used boolean not null default false
);
create table if not exists faucet_claims (
  id text primary key,
  wallet text not null,
  ip_hash text not null,
  auth text not null check (auth in ('signature', 'passkey-session')),
  tx_hashes text[] not null default '{}',
  status text not null check (status in ('funded', 'refused', 'failed')),
  created_at_ms bigint not null
);
create index if not exists faucet_claims_wallet_time on faucet_claims (lower(wallet), created_at_ms desc);
create index if not exists faucet_claims_ip_time on faucet_claims (ip_hash, created_at_ms desc);
create index if not exists faucet_claims_time on faucet_claims (created_at_ms desc);
