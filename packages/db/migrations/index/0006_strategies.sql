-- The StrategyRegistry's projections and the ERC-8004 feedback its agents receive (plan C.4.2 `idx_strategies`,
-- `idx_subscriptions`, `idx_agent_feedback`; S9). Like the vault's (index/0002), these events carry no engine `seq` and
-- are stored in idx_events with `market` NULL, each applied exactly once in (block, log index) order. Derived and
-- rebuildable: truncate and replay from the registry's deploy block (feedback: from the first agent we know). Amounts are
-- pathUSD base units (NUMERIC, never floats). The chain stays the truth for anything a write depends on (the copy
-- drawer re-reads `strategyOf`); these tables are for the board, profiles and the runner's subscriber list.

-- One row per strategy. `metadata` is the published bytes as UTF-8, stored only when their keccak matches the event's
-- `metadataHash` (the follower reads `metadataOf` when it sees Published/Updated); NULL until then.
create table if not exists idx_strategies (
  registry                  text     not null,
  strategy_id               bigint   not null,
  creator                   text     not null,
  runner                    text     not null,
  spec_hash                 text     not null,
  metadata_hash             text,
  metadata                  text,
  agent_id                  numeric,
  max_stake_per_trade_base  numeric  not null,
  max_daily_spend_base      numeric  not null,
  max_open_positions        integer  not null,
  max_price_raw             numeric  not null,
  -- The envelope's series scope; NULL is any Window (D-219.1).
  series                    text,
  fee_base                  numeric  not null,
  active                    boolean  not null default true,
  subscribers               integer  not null default 0,
  revision                  integer  not null default 0,
  created_tx                text     not null,
  created_block             bigint   not null,
  created_at_sec            bigint   not null,
  updated_at_sec            bigint   not null,
  primary key (registry, strategy_id)
);
create index if not exists idx_strategies_creator_idx on idx_strategies (creator);
create index if not exists idx_strategies_runner_idx on idx_strategies (runner, active);
create index if not exists idx_strategies_agent_idx on idx_strategies (agent_id) where agent_id is not null;

-- One row per (strategy, subscriber): the consent as the last Subscribed/Unsubscribed left it. `mode` is the registry's
-- enum (0 follow, 1 fade); `fees_paid_base` sums every fee the subscriber paid this creator for it.
create table if not exists idx_subscriptions (
  registry                  text     not null,
  strategy_id               bigint   not null,
  subscriber                text     not null,
  grant_id                  bigint   not null,
  mode                      smallint not null,
  active                    boolean  not null,
  fees_paid_base            numeric  not null default 0,
  first_subscribed_at_sec   bigint   not null,
  subscribed_at_sec         bigint   not null,
  unsubscribed_at_sec       bigint,
  primary key (registry, strategy_id, subscriber)
);
create index if not exists idx_subscriptions_subscriber_idx on idx_subscriptions (subscriber);

-- ERC-8004 ReputationRegistry feedback (`NewFeedback` / `FeedbackRevoked`) on any agent; the board joins it to the
-- agents its strategies name. `value` is the signed fixed-point score as given, with its decimals.
create table if not exists idx_agent_feedback (
  registry                  text     not null,
  agent_id                  numeric  not null,
  client                    text     not null,
  feedback_index            bigint   not null,
  value                     numeric  not null,
  value_decimals            smallint not null,
  tag1                      text     not null,
  tag2                      text     not null,
  endpoint                  text     not null,
  feedback_uri              text     not null,
  feedback_hash             text     not null,
  revoked                   boolean  not null default false,
  tx_hash                   text     not null,
  block_number              bigint   not null,
  at_sec                    bigint   not null,
  primary key (registry, agent_id, client, feedback_index)
);
