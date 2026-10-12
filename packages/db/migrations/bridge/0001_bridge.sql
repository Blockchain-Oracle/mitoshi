-- The bridge's records (S14 14o; D-227 R4-12). Everything here is public chain data, kept so the tracker survives a
-- killed tab, Portfolio can show what is in flight, and the ETA is a measurement, not a promise.
--
-- bridge_messages: one row per transfer, written by `/api/bridge` the moment the source wallet returns its hash (before
-- the receipt) and advanced by ops `bridge-watch` from LayerZero Scan and the chains. `legs` is the route's legs in
-- order (`{guid, status, stuck, srcTx, srcAtSec, verifiedAtSec, dstTx, dstAtSec}`); `guid1`/`guid2` index them for
-- lookup. `duration_sec` (source block → final delivery) feeds the medians the route line shows.
create table if not exists bridge_messages (
  id               bigserial primary key,
  network          text      not null check (network in ('testnet', 'mainnet')),
  direction        text      not null check (direction in ('in', 'out')),
  ticker           text      not null,
  src_chain_id     integer   not null,
  src_tx           text      not null,
  sender           text      not null,
  recipient        text      not null,
  amount_sd        numeric   not null,
  status           text      not null default 'pending' check (status in ('pending', 'in-flight', 'stuck', 'deferred', 'delivered', 'failed', 'reverted')),
  phase            text      not null default 'sent',
  legs             jsonb     not null default '[]'::jsonb,
  guid1            text,
  guid2            text,
  attempts         integer   not null default 0,
  last_error       text,
  created_at_ms    bigint    not null,
  updated_at_ms    bigint    not null,
  delivered_at_ms  bigint,
  duration_sec     integer,
  unique (src_chain_id, src_tx)
);
create index if not exists bridge_messages_open_idx on bridge_messages (updated_at_ms) where status in ('pending', 'in-flight', 'stuck');
create index if not exists bridge_messages_sender_idx on bridge_messages (sender, created_at_ms desc);
create index if not exists bridge_messages_recipient_idx on bridge_messages (recipient, created_at_ms desc);
create index if not exists bridge_messages_guid1_idx on bridge_messages (guid1);
create index if not exists bridge_messages_guid2_idx on bridge_messages (guid2);
create index if not exists bridge_messages_delivered_idx on bridge_messages (network, direction, delivered_at_ms desc) where status = 'delivered';

-- reserve_snapshots: ops `reserve-watch`, one row per ticker every 5 minutes — what each chain held at a stated block
-- (6-dp shared units), the checks `@cwf/core` `conservation` ran, and any alert. The issuer holder set and the block it
-- was scanned to are the next scan's cursor (TIP-20 has no role enumeration; Moderato caps logs at 100k blocks).
create table if not exists reserve_snapshots (
  id                bigserial primary key,
  network           text      not null check (network in ('testnet', 'mainnet')),
  ticker            text      not null,
  at_ms             bigint    not null,
  tempo_block       numeric   not null,
  base_block        numeric,
  rh_block          numeric,
  locked_sd         numeric,
  outstanding_sd    numeric,
  owed_sd           numeric,
  transit_sd        numeric,
  supply_sd         numeric   not null,
  deferred_sd       numeric   not null,
  minted_net_sd     numeric   not null,
  supply_cap_sd     numeric   not null,
  issuers           text[],
  issuers_to_block  numeric,
  verdict           text      not null check (verdict in ('backed', 'short', 'partial')),
  checks            jsonb     not null,
  alert             text
);
create index if not exists reserve_snapshots_ticker_idx on reserve_snapshots (network, ticker, at_ms desc);
create index if not exists reserve_snapshots_alert_idx on reserve_snapshots (network, at_ms desc) where alert is not null;

-- stock_sync_messages: ops `stock-sync` pushes of Robinhood multiplier/status snapshots (StockSyncSender → Base
-- forwarder → Tempo StockSyncReceiver), one row per `sync` transaction, delivered when LayerZero Scan says so.
create table if not exists stock_sync_messages (
  id               bigserial primary key,
  network          text      not null check (network in ('testnet', 'mainnet')),
  src_tx           text      not null unique,
  guid             text,
  seq              numeric,
  tokens           text[]    not null,
  fee_wei          numeric   not null,
  status           text      not null default 'sent' check (status in ('sent', 'delivered', 'stuck', 'failed')),
  note             text,
  created_at_ms    bigint    not null,
  updated_at_ms    bigint    not null,
  delivered_at_ms  bigint
);
create index if not exists stock_sync_messages_open_idx on stock_sync_messages (updated_at_ms) where status in ('sent', 'stuck');
