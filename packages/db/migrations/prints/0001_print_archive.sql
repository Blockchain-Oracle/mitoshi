-- Signed price packages kept past the providers' retention (plan C.4.4, S0.11). One row per (source, boundary T).
create table if not exists print_archive (
  source        text        not null check (source in ('redstone', 'datastreams', 'attested', 'pyth-imported')),
  t_sec         bigint      not null,
  fetched_at    timestamptz not null default now(),
  complete      boolean     not null,
  summary       jsonb       not null,
  feeds         jsonb       not null,
  origin        text        not null default 'ops',
  primary key (source, t_sec)
);
create index if not exists print_archive_t_idx on print_archive (t_sec desc);
