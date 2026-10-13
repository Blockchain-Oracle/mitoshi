-- D-231 (owner, 2026-10-13): the bridge left the product, so the indexer no longer follows the five Moderato
-- TIP20MintBurnAdapter proxies (index/0007). Their projection, raw events and cursors go; everything here was derived
-- from chain and is rebuildable. 0007_bridge_events.sql stays: migrations are append-only and replay in order.
drop table if exists idx_bridge_events;
delete from idx_events where chain_id = 42431 and address in (
  '0x5c1069c9f9912d5b8f6250359b5f2fb6f6a426b3', -- AdapterTSLA
  '0x48a9873c3b376d2fe54ea2c1a38da1eb2c25c862', -- AdapterAMZN
  '0x8f859355d347b5c03d8e94f6519adb117bf94a6c', -- AdapterPLTR
  '0x1546e137e4fafa52c0e83ced103322ad3b62e801', -- AdapterNFLX
  '0x535afe496eaee0736570cc4abe2db7d18cf41023'  -- AdapterAMD
);
delete from idx_cursor where chain_id = 42431 and address in (
  '0x5c1069c9f9912d5b8f6250359b5f2fb6f6a426b3',
  '0x48a9873c3b376d2fe54ea2c1a38da1eb2c25c862',
  '0x8f859355d347b5c03d8e94f6519adb117bf94a6c',
  '0x1546e137e4fafa52c0e83ced103322ad3b62e801',
  '0x535afe496eaee0736570cc4abe2db7d18cf41023'
);
