-- The Memory Market's optional paid read (L-56): the price of one read for a wallet that doesn't copy the strategy,
-- in pathUSD base units, as the creator signed it into the seal. 0 keeps the memory to copiers; at most $5.
alter table strategy_sealed_memory add column if not exists read_price_base bigint not null default 0;
alter table strategy_sealed_memory drop constraint if exists strategy_sealed_memory_read_price_check;
alter table strategy_sealed_memory add constraint strategy_sealed_memory_read_price_check check (read_price_base between 0 and 5000000);
