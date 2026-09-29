# S14 — Stocks on Tempo: the bridge (14c wave 1; 14o after S3; 14w UI after S1, wired and gated after 14c.10, 14o, S4, S5; App. B.1–B.2)

- [ ] 14c.1–2 Spike X1 (`src/lz/LzPing.sol`, dummy OFT round trip).
- [x] 14c.3 `src/common/{BridgeTypes,BridgeRateLimiter,StockSyncCodec}.sol` + codec fuzz tests.
- [x] 14c.4 `src/robinhood/StockLockbox.sol` + the B.6 lockbox tests. 14c.5 `src/robinhood/StockSyncSender.sol` (staticcall probes).
- [x] 14c.6 `src/transit/{TransitOFT,HopComposer,StockSyncForwarder}.sol`.
- [x] 14c.7 `src/stocks/TIP20MintBurnAdapter.sol` (proxy; `_credit` deferral in order B.1.4; `_payNative` → LZD via
  pathUSD). 14c.8 `src/stocks/{StockSyncReceiver,ScaledUIView}.sol` (pre-warmed slots).
- [x] 14c.9 `script/stocks/IssueMirrors.s.sol` (B.2) for TSLA, AMZN, PLTR, NFLX, AMD on Moderato.
- [ ] 14c.10 Deploy + `EnsureLzConfig` / `CheckLzConfig` per network (B.1.5 table); fragments `46630/84532/42431`.
- [x] 14c.11 Invariants (direct + hop: locked == supply + deferred + in flight + owed); sizes both profiles.
- [x] 14c.12 Forks: RH testnet lock/unlock; Base hop; Moderato adapter (real LZD wrap, fresh-address mint gas); RH
  mainnet CRWD multiplier (effectiveAt 1782999000).
- [x] 14c.13 Owner-approved outreach: LayerZero direct 40451↔40444 request; Wormhole plan-B probe. (Drafted below; the owner sends — owner-actions.)
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

## 14c.13 Outreach drafts (owner sends; nothing was sent)

### A. LayerZero — request a direct testnet pathway 40451 ↔ 40444

To: LayerZero Labs developer support (Discord `#dev-support` or the "Request a pathway" form on docs.layerzero.network).
Subject: Enable default config for Robinhood Chain testnet (EID 40451) ↔ Tempo Moderato (EID 40444)

> Hi LayerZero team,
>
> We're building Mitoshi, a Tempo app that bridges Robinhood Chain Stock Tokens to Tempo as TIP-20 mirrors with an
> `OFTAdapter` lockbox on Robinhood Chain and a mint/burn adapter on Tempo (the USDT0/frxUSD shape). On mainnet the
> Robinhood Chain (30416) ↔ Tempo (30410) pathway is supported and we configure our own DVNs.
>
> On testnet the direct pathway isn't available: `isSupportedEid(40444)` is false on the Robinhood testnet EndpointV2
> `0x3aCAAf60502791D199a5a5F0B173D78229eBFe32`, and `isSupportedEid(40451)` is false on the Moderato EndpointV2
> `0xFB34352bA2e2D9cB93837bb19D36db5d93BcFC41`; the executors revert and the Moderato LayerZero Labs DVN
> `0x0ac2924460A5b285fd205DeDB46738Ad46971061` returns `DVN_EidNotSupported(40451)`. Since `setSendLibrary` requires the
> library to support the EID, an OApp can't open it itself.
>
> Could you set default Uln302 send/receive configs (LayerZero Labs DVN is fine) and executor configs for 40451 ↔ 40444
> on both endpoints (SendUln302 `0x45841dd1ca50265Da7614fC43A361e526c0e6160` / ReceiveUln302
> `0xd682ECF100f6F4284138AA925348633B0611Ae21` on 40451; SendUln302 `0x91ec94dd5E949BdB2ecE3b91B9602EC5F7F59FFD` /
> ReceiveUln302 `0xfeBE4c839EFA9f506C092a32fD0BB546B76A1d38` on 40444), and price the pathway in the executors
> (`0x701f3927871EfcEa1235dB722f9E608aE120d243`, `0xE665f5dFD91DFe883D36Cc8552D4Cc385aC23687`)?
>
> Until then we route through Base Sepolia (40245) with a transit OFT and a composer, which works but doubles latency
> and fees. Our Moderato OApps are live (e.g. the TSLA adapter `0x5c1069C9F9912D5B8f6250359b5f2FB6F6a426b3`, the sync
> receiver `0xE1576984eA22F1E620CFCCa6bf6154C4b9a3693e`) if you want to check traffic once it's enabled.
>
> Thanks!

When it's enabled: `EnsureLzConfig` switches the lockbox/adapter peers to each other (drop the hop) — the mainnet shape.

### B. Wormhole plan-B probe (testnet)

Read-only finding (2026-09-29): the RH testnet Wormhole core `0xBB73cB66C26740F31d1FabDC6b7A46a038A300dd` (chain 72,
`messageFee` 0, guardian set 0) **now has signed VAAs on testnet Wormholescan** — sequences 0–2 from two emitters on
2026-09-24/25 (e.g. tx `0xed4c0c4b19d63e8adaa75f5be71645cf863a71c6670ece6debae5789ae430986`). The research's "0 VAAs"
(F25) is out of date. Probe once the deployer has RH ETH (testnet only, one tx):
`cast send 0xBB73cB66C26740F31d1FabDC6b7A46a038A300dd "publishMessage(uint32,bytes,uint8)" 0 0x6d69746f736869 1` → watch
`api.testnet.wormholescan.io/api/v1/vaas/72/<emitter>/<seq>`; if signed within minutes, Wormhole NTT (RH hub lock mode,
Tempo spoke burn mode) is a live plan B for testnet as well as mainnet. No message to the Wormhole team is needed unless
the VAA doesn't appear; then ask in the Wormhole Discord `#developers` whether testnet guardians observe chain 72.

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
- **F14-11 Sizes (runtime / initcode, 24,576 B limit; our cap 23.5 KB):** Tempo — TIP20MintBurnAdapter 15,946 / 16,755,
  StockSyncReceiver 6,243 / 6,638, ScaledUIView 1,988 / 2,248, LzPingTempo 6,981 / 7,547; evm — StockLockbox 12,831 /
  13,637, TransitOFT 10,754 / 12,063, StockSyncSender 8,555 / 8,947, StockSyncForwarder 8,207 / 8,694, HopComposer
  2,865 / 3,264. Deploy gas on Moderato: adapter implementation 22.4M (< 30M lane).
- **F14-12 Invariants:** direct path on a Moderato fork (real TIP-20 + LZD; `LockboxAlt` differs only in paying LZD) —
  24 runs × 24 calls, conservation / outstanding bound / no unbacked mint + `afterInvariant` settle-and-redeem-everyone
  empties the lockbox; hop path (evm) — 48 × 30 incl. bounces and owed. Both green.
- **F14-13 Forks (live contracts, read-only):** RH testnet — lock through the live endpoint 0.000103 ETH to Base,
  unlock of real faucet TSLA 105k gas (MIN_UNLOCK_GAS 120k + 150k enforced OK), testnet Stock flags = token-paused
  supported only. Base Sepolia — deployed TransitTSLA/HopComposerTSLA: compose + onward send **319k gas** (< the 400k
  budget), onward Base → Moderato fee at 1M gas **0.000111 ETH**, empty float leaves the compose stored. Moderato —
  deployed AdapterTSLA: fresh-holder credit **582k**, warm 84k (D-080's 1M holds); bridge back via the hop 0.219679 LZD
  paid in pathUSD, packet emitted by the live endpoint. RH mainnet — CRWD `uiMultiplier` 4e18 / pending 4e18 /
  `effectiveAt` 1782999000, oracle supported; the default config is flagged (unpinned, dead DVN), the B.1.5 mainnet row
  applies to the real Uln302s and checks clean; RH → Tempo sync fee for one token 0.0000918 ETH.

## Handoff

_Not started._
