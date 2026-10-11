-- The store mppx's server needs for replay protection (mppx `Store.AtomicStore`): a payment credential (a charge's
-- transaction hash) is consumed once, across restarts and processes. Keys and values are mppx's own; values are JSON.
create table if not exists mpp_store (
  key         text        primary key,
  value       jsonb       not null,
  updated_at  timestamptz not null default now()
);
