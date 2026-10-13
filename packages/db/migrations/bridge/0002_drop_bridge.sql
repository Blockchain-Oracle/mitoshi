-- D-231 (owner, 2026-10-13): the Robinhood ↔ Base Sepolia ↔ Tempo bridge left the product. Its stores go with it: the
-- transfer tracker (`/api/bridge`, ops bridge-watch), the reserve snapshots (`/reserves`, ops reserve-watch) and the
-- stock-sync log (ops stock-sync). Testnet records only; the contracts stay deployed on Moderato and Base Sepolia, and
-- their record is contracts/deployments/retired/. 0001_bridge.sql stays: migrations are append-only and replay in order.
drop table if exists bridge_messages;
drop table if exists reserve_snapshots;
drop table if exists stock_sync_messages;
