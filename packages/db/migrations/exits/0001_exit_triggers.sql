-- Exits with the app closed (S24.3, D-193): one trigger per Trading Balance position (vault, owner, Window, side) — the
-- owner's take-profit, stop-loss and trail as their session key signed them (EIP-712, `@cwf/core/exits`), written by
-- `/api/exits` and run by the ops `exit-keeper`, which sells through the owner's EXIT grant at no less than the vault's
-- fair-value floor. A write replaces the row only with a larger nonce and never while the keeper is firing it; a write
-- with nothing set cancels. `trail_stop_e8` is the stop now (the keeper moves it in the position's favour);
-- `signed_trail_stop_e8` is the one the owner signed. The keeper claims a row (armed → firing) before it sends and
-- records the transaction as soon as it is signed, so a restart resumes from the chain rather than selling twice.
create table if not exists exit_triggers (
  id                    bigserial primary key,
  chain_id              integer   not null,
  vault                 text      not null,
  owner                 text      not null,
  market                text      not null,
  side                  text      not null check (side in ('up', 'down')),
  grant_id              numeric   not null,
  signer                text      not null,
  take_profit_base      numeric,
  stop_loss_base        numeric,
  trail_bps             integer,
  trail_stop_e8         numeric,
  signed_trail_stop_e8  numeric,
  nonce                 numeric   not null,
  expires_at_sec        bigint    not null,
  signature             text      not null,
  status                text      not null check (status in ('armed', 'firing', 'fired', 'cancelled', 'expired', 'gone')),
  reason                text      check (reason in ('trail', 'tp', 'sl')),
  attempts              integer   not null default 0,
  last_error            text,
  fire_tx               text,
  firing_since_ms       bigint,
  proceeds_base         numeric,
  contracts_raw         numeric,
  created_at_ms         bigint    not null,
  updated_at_ms         bigint    not null,
  fired_at_ms           bigint,
  unique (vault, owner, market, side)
);
create index if not exists exit_triggers_live_idx on exit_triggers (status, expires_at_sec) where status in ('armed', 'firing');
create index if not exists exit_triggers_owner_idx on exit_triggers (owner, updated_at_ms desc);
