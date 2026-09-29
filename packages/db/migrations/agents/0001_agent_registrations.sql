-- ERC-8004 agents the platform registered (plan C.4.6, N-07). One row per (chain, agent id); `strategy_id` is the
-- product's key (the registration file is served at /api/agents/<strategy_id>/registration.json).
create table if not exists agent_registrations (
  chain_id      integer     not null,
  agent_id      numeric(78, 0) not null,
  strategy_id   text        not null,
  owner         text        not null,
  name          text        not null,
  description   text        not null,
  image         text        not null,
  agent_uri     text        not null,
  active        boolean     not null default true,
  register_tx   text        not null,
  registered_at timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (chain_id, agent_id),
  unique (chain_id, strategy_id)
);
