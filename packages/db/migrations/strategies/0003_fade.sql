-- S9 (A-1c, D-219): a fill and an attempt carry the subscriber's consent — `follow`, or `fade` (the runner sent the other
-- side of the strategy's call). Rows written before this were all follows.
alter table strategy_fills add column if not exists mode text not null default 'follow' check (mode in ('follow', 'fade'));
alter table strategy_attempts add column if not exists mode text not null default 'follow' check (mode in ('follow', 'fade'));
