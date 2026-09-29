-- MPP payments the platform makes (plan C.4.6, C.5.3, D-033). One row per paid (or failed) request; money in base
-- units. Charge rows carry the TIP-20 transfer tx hash in `reference`; session rows carry the TIP-1034 channel id and the
-- accepted cumulative voucher. `decision_id` / `rebalance_id` / `sensei_id` link a payment to what it paid for.
create table if not exists mpp_receipts (
  id                      bigserial   primary key,
  chain_id                integer     not null,
  host                    text        not null,
  path                    text        not null,
  method                  text        not null,
  intent                  text        not null,
  status                  text        not null check (status in ('paid', 'failed')),
  challenge_id            text        not null,
  currency                text        not null,
  amount_base             numeric(78, 0) not null check (amount_base >= 0),
  recipient               text,
  payer                   text        not null,
  reference               text,
  channel_id              text,
  accepted_cumulative_base numeric(78, 0),
  spent_base              numeric(78, 0),
  decision_id             text,
  rebalance_id            text,
  sensei_id               text,
  purpose                 text,
  raw                     jsonb       not null default '{}'::jsonb,
  received_at             timestamptz not null default now(),
  check (status = 'failed' or reference is not null)
);
create index if not exists mpp_receipts_decision_idx on mpp_receipts (decision_id) where decision_id is not null;
create index if not exists mpp_receipts_rebalance_idx on mpp_receipts (rebalance_id) where rebalance_id is not null;
create index if not exists mpp_receipts_received_idx on mpp_receipts (received_at desc);
create unique index if not exists mpp_receipts_charge_ref_idx on mpp_receipts (chain_id, reference) where intent = 'charge' and reference is not null;
