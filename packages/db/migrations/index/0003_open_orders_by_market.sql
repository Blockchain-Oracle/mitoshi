-- The settler's holders read (`services/ops/src/actors/settler/index.ts` holdersOf) asks for a Window's open orders by
-- market on every pass; without this index it was a parallel sequential scan of idx_orders (≈ 150 ms at 459 k rows
-- on testnet, 2026-10-08) per Window. Open orders are a small slice, so the partial index stays small.
create index if not exists idx_orders_open_market_idx on idx_orders (market) where status = 'open';
