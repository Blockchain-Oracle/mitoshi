-- Private bets (S10d, A.4.4): the desk's claims stored server-side per account — the reference kept them only in the
-- browser, which loses money on a new device and does not exist in the app. The chain names no owner on any slot; this
-- table is the desk operator's record, read only by the owner's own session (`/api/private/claims`).
-- `request` keeps the signed open (with the committed secret the slot's keys derive from) only while the desk has not
-- answered definitively, so a lost reply is resumed, never re-signed; it is cleared once the bet opened or was refused.
create table if not exists private_claims (
  slot_id text primary key,
  owner text not null,
  chain_id integer not null,
  status text not null check (status in ('pending', 'open', 'refused', 'credited')),
  request jsonb,
  ticket jsonb,
  result jsonb,
  created_at_ms bigint not null,
  updated_at_ms bigint not null
);
create index if not exists private_claims_owner_time on private_claims (owner, created_at_ms desc);
