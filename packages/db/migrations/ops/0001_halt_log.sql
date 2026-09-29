-- halt-watch's recorded observations (plan S3 gate "recorded halts replayed"): one row per pass that observed any halt
-- reason or changed the confirmed board. `scripts/drive/halt-replay.ts` feeds `observed` back through the same pure
-- rules and must reproduce `confirmed` row for row. Kept 30 days.
create table if not exists halt_log (
  id           bigserial primary key,
  pass_sec     bigint   not null,
  in_hours     boolean  not null,
  -- Non-null observed reasons by asset (TSLA, TSLA-24, BTC …).
  observed     jsonb    not null,
  -- The confirmed board after this pass (non-null reasons only).
  confirmed    jsonb    not null,
  fixture      text
);
create index if not exists halt_log_time_idx on halt_log (pass_sec);
