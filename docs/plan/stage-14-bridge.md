# S14 — Stocks on Tempo: the bridge (14c wave 1; 14o after S3; 14w UI after S1, wired and gated after 14c.10, 14o, S4, S5; App. B.1–B.2)

- [ ] 14c.1–2 Spike X1 (`src/lz/LzPing.sol`, dummy OFT round trip).
- [x] 14c.3 `src/common/{BridgeTypes,BridgeRateLimiter,StockSyncCodec}.sol` + codec fuzz tests.
- [x] 14c.4 `src/robinhood/StockLockbox.sol` + the B.6 lockbox tests. 14c.5 `src/robinhood/StockSyncSender.sol` (staticcall probes).
- [x] 14c.6 `src/transit/{TransitOFT,HopComposer,StockSyncForwarder}.sol`.
- [x] 14c.7 `src/stocks/TIP20MintBurnAdapter.sol` (proxy; `_credit` deferral in order B.1.4; `_payNative` → LZD via
  pathUSD). 14c.8 `src/stocks/{StockSyncReceiver,ScaledUIView}.sol` (pre-warmed slots).
- [x] 14c.9 `script/stocks/IssueMirrors.s.sol` (B.2) for TSLA, AMZN, PLTR, NFLX, AMD on Moderato.
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

- **F14-1 Faucets (2026-09-29):** no programmatic faucet reaches RH testnet (46630) or Base Sepolia (84532). The official
  RH faucet is behind Vercel's bot check; QuickNode/Alchemy/Chainstack need mainnet ETH or login; ZalalenA needs hCaptcha
  + Turnstile; Base Sepolia faucets (CDP, Superchain, thirdweb, Alchemy) need a sign-in or CAPTCHA. The RH testnet
  `Faucet` contract `0x8762…17Be` is `onlyOwner` (`sendTokensAndEther`), so it can't be self-served. Needed (owner):
  deployer `0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e` ≥ 0.05 ETH on 46630 (+ the 5 × 5 Stock Tokens) and ≥ 0.2 ETH on
  84532; stock-sync `0x51476Dd5CaEb8BEE9585050A9152dea729fC8610` ≥ 0.02 ETH on 46630.
- **F14-2 Dead DVNs, full addresses** (LZ metadata `deployments`, `deadDVN`): RH `0x6788f52439ACA6BFF597d3eeC2DC9a44B8FEE842`,
  Tempo `0x3436d350103a9dfA252a04f102f9f10f58Ff450C`, RH testnet `0x88B27057A9e00c5F05DDa29241027afF63f9e6e0`, Base Sepolia
  `0x78551ADC2553EF1858a558F5300F7018Aad2FA7e`, Moderato `0x236B9303d513dDF3f4c4E93A640fB80A178872f1` (`script/lib/LzNetworks.sol`).
- **F14-3 Moderato → Base Sepolia fee (fork of block 37363418, real endpoint):** 100k lzReceive gas quotes **0.213516 LZD**
  (executor 0.202337 + LZ Labs DVN 0.011179; treasury 0). `LzdFee.pay` pulled exactly that in pathUSD, `LZD.wrap` minted it
  to the endpoint, the endpoint forwarded it to SendUln302. Tempo rejects `msg.value` at the protocol level (call reverts
  without data), so the adapter's `ValueNotAccepted` is belt-and-braces.
- **F14-4 Tempo deploy gas:** an 7 KB OApp costs 8.39M gas on Moderato (TIP-1000 state creation); scripts must broadcast one
  contract per tx and keep each under the 30M general-lane limit.
- **F14-5 via-IR reads `block.timestamp` once per function:** after `vm.warp` a test must read time with
  `vm.getBlockTimestamp()` (a fuzz test computed elapsed = 0 otherwise). Contracts are unaffected (each call is fresh).
- **F14-6 Fresh-holder mint gas on Tempo (Moderato fork):** TIP-20 `mint` to a new holder 510k; adapter `lzReceive` 552k
  fresh / 56k warm; first message on a path ~852k with the endpoint's first writes → D-080 (enforced 1M, check 600k,
  pre-warmed counters). TIP-1028 receive policies are live on Moderato (`setReceivePolicy` + `validateReceivePolicy`).
- **F14-7 Tests on Tempo can't use `msg.value`:** both ends of an in-VM mesh must be EndpointV2Alt paying LZD
  (`test/shared/RemoteOFTAlt.sol`), and the remote leg pays Tempo gas too, so test sends use 1M lzReceive gas.
- **F14-8 Devtools mock workers are gas-heavy:** a HopComposer onward send needs ~1.5M in the mock mesh vs the plan's
  400k compose gas; the live figure is measured on the Base Sepolia fork (14c.12).
- **F14-9 Shared deployer key across lanes:** a Moderato broadcast failed with "EOA nonce changed unexpectedly" while
  another lane used the same deployer; a re-run of the ensure-style script finished cleanly. Parallel lanes should
  broadcast with distinct keys or serialise.
- **F14-10 Live leg latency:** Moderato → Base Sepolia ping delivered in **20 s** (source timestamp → receive block).
  Base Sepolia → Moderato waits on the LayerZero Labs DVN for > 20 min (Base Sepolia source confirmations).

## Handoff

_Not started._
