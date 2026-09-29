# S14 — Stocks on Tempo: the bridge (14c wave 1; 14o after S3; 14w UI after S1, wired and gated after 14c.10, 14o, S4, S5; App. B.1–B.2)

- [ ] 14c.1–2 Spike X1 (`src/lz/LzPing.sol`, dummy OFT round trip).
- [ ] 14c.3 `src/common/{BridgeTypes,BridgeRateLimiter,StockSyncCodec}.sol` + codec fuzz tests.
- [ ] 14c.4 `src/robinhood/StockLockbox.sol` + the B.6 lockbox tests. 14c.5 `src/robinhood/StockSyncSender.sol` (staticcall probes).
- [ ] 14c.6 `src/transit/{TransitOFT,HopComposer,StockSyncForwarder}.sol`.
- [ ] 14c.7 `src/stocks/TIP20MintBurnAdapter.sol` (proxy; `_credit` deferral in order B.1.4; `_payNative` → LZD via
  pathUSD). 14c.8 `src/stocks/{StockSyncReceiver,ScaledUIView}.sol` (pre-warmed slots).
- [ ] 14c.9 `script/stocks/IssueMirrors.s.sol` (B.2) for TSLA, AMZN, PLTR, NFLX, AMD on Moderato.
- [ ] 14c.10 Deploy + `EnsureLzConfig` / `CheckLzConfig` per network (B.1.5 table); fragments `46630/84532/42431`.
- [ ] 14c.11 Invariants (direct + hop: locked == supply + deferred + in flight + owed); sizes both profiles.
- [ ] 14c.12 Forks: RH testnet lock/unlock; Base hop; Moderato adapter (real LZD wrap, fresh-address mint gas); RH
  mainnet CRWD multiplier (effectiveAt 1782999000).
- [ ] 14c.13 Owner-approved outreach: LayerZero direct 40451↔40444 request; Wormhole plan-B probe.
- [ ] 14o ops `stock-sync`, `reserve-watch`, `bridge-watch`; migrations `bridge_messages`, `reserve_snapshots`,
  `stock_sync_messages`.
- [ ] 14w `packages/core/src/{stocks,bridge}`; `packages/markets/src/stocks/{bridge,holdings,reserves,sync}.ts`;
  `relay/policies/stocks.ts`; `/status` LayerZero probe. `/bridge` as a stepper (E.3 bridge): connect Robinhood wallet
  (injected or WalletConnect) → token and amount (remaining rate-limit capacity shown first) → review (fee in and out,
  ETA, destination = your passkey address with avatar) → sign in the source wallet → in flight → delivered; the in-flight
  tracker keyed by guid (source confirmed → verified → executed, both legs on testnet, LZ Scan + both explorers)
  persists server-side and shows on Portfolio; deferred/stuck states with plain actions (`claimDeferred`, resend), never a
  bare spinner. `/reserves`: per-ticker locked | supply | in flight | owed with the conservation check, "as of block N",
  one-tap in-browser re-read, issuer powers and pause-propagation state (ST-15) in plain words;
  a first-use explainer on the first bridge. Holdings in UI amounts; ST-13 disclosure collapsible after
  first acknowledgement. 21st starts: processing timeline 29371 + multi-chain swap 16251 (bridge); stats 7870 + partition
  bar 26545 + status bar 26906 + audit log 25163 (reserves, weak coverage).
- **Gate:** real faucet TSLA locked on 46630 → minted on 42431 via 84532 → burned → unlocked (4 tx hashes + LZ Scan
  links); a `sync` applied through the forwarder and a duplicate ignored; a deferral (recipient receive policy) then
  `claimDeferred`; `/reserves` == both explorers; `CheckLzConfig` green; the tracker survives a killed tab; UX gate. **Rows:**
  ST-01…ST-07, ST-12…ST-15, G-08, UX-08.

## Findings

_None yet._

## Handoff

_Not started._
