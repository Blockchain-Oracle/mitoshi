-- R6 #9 (D-230): what one runner pass did for one strategy, as data (`@cwf/core` RunnerBeat: idle and why, or a scan's
-- Windows read, nearest trigger, calls, copies filled and copiers skipped by reason). The app words it; `why` stays the
-- ops log's line. Null on rows written before it.
alter table runner_heartbeats add column if not exists state jsonb;

-- A rule's or a mirror's call is recorded in the decision log like an agent's read (model `rule/<preset>`); the count
-- per strategy reads newest-first over this index.
create index if not exists strategy_decisions_live_idx on strategy_decisions (strategy_id, decided_at desc) where dry_run = false and gate <> 'pending';
