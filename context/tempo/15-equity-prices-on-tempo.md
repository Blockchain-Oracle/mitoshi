# 15 — Equity (and crypto) prices on Tempo

Captured **Mon 2026-09-21, 12:20–12:52 UTC** (08:20–08:52 ET: US pre-market, the overnight session had
run since Sun 20:00 ET). Method: live `cast` reads and `eth_call` simulations against Tempo mainnet
(`https://rpc.tempo.xyz`, 4217), Moderato (`https://rpc.moderato.tempo.xyz`, 42431) and Robinhood Chain
(`https://rpc.mainnet.chain.robinhood.com`, 4663); keyless gateway and API probes; provider repos pinned
by SHA. This builds on Agari (`agari-wt/w1@254f538` `context/02`, `context/13`, `docs/plan/decisions.md`)
and does not repeat it. **[C]** = confirmed this pass. **[I]** = inference. Anything we could not check
is marked **unverified**, with what we tried. Scratch outputs are in the session scratchpad and are not
committed.

## Summary

Tempo has **no push feed for any US equity**, from any provider. Chainlink's 10 Tempo feeds, RedStone's
13 and Chronicle's 20 are all stablecoins, yield dollars, FX and BTC/ETH wrappers. Two things do work on Tempo.
- **Chainlink Data Streams works on Tempo mainnet today.** The VerifierProxy
  `0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7` uses the same verifier and DON config digests as Robinhood
  Chain. It has no fee manager and no access controller.
  - We took a real **v11 SPY RegularHours report** out of a Robinhood Chain transaction and replayed it
    against Tempo with `eth_call`. It verified: mid 763.025, `marketStatus` 2, observed 2026-09-09 18:00Z.
    It is **12 days old** and still verifies.
  - Streams exist for every ticker on our list: 24/5 sessions, and a unique report window per timestamp.
  - They cost **$150 per stream per month**, self-serve, with no free tier. They are mainnet-only for us:
    the Moderato verifier uses a different digest.
- **RedStone pull works on Tempo for free.** The public gateway signs `redstone-primary-prod` packages every
  10 s, 3-of-5, for TSLA, NVDA, AAPL, MSFT, META, GOOGL, AMZN, **PLTR and AMD**, BTC/ETH/SOL and XAU.
  - We recovered all 5 authorised signers of a live TSLA package with Tempo's own `ecrecover`.
  - Limits: **no NFLX, SPY, QQQ, GLD, IAU or SPCX**, history only about 24 h back, and licence questions
    (the monorepo is BUSL-1.1).

**Pyth is deployed on Tempo but unusable.**
- The Core contract (v1.4.5-alpha.1) was **not** upgraded. A genuine post-upgrade Hermes blob reverts
  `InvalidWormholeVaa` on Tempo; the same blob verifies on Base.
- Pyth Pro's verifier charges 1 wei. Tempo rejects every value transfer, so it cannot be paid.

Robinhood Chain has 34 Chainlink push feeds for Robinhood tokenized equities (24/5, token price =
share × `uiMultiplier`). There is no CCIP lane from Robinhood Chain to Tempo to relay them, and on Tempo
the equivalent Data Streams verify natively anyway.

Alpha Vantage over MPP costs **$0.008 per call** in USDC.e. It is unsigned, its freshness is unverified, and
Alpha Vantage's own terms are personal and non-commercial.

**Recommendation for the single-name Regular lane:** RedStone as primary, with Chainlink Data Streams as the paid
cross-check. Streams are the only signed source for NFLX, SPY, QQQ, gold ETFs and SPCX.

## Findings

| # | Finding | Source | |
|---|---|---|---|
| 1 | Tempo mainnet Chainlink push feeds: **10**. USDC, USDT, EUR, CAD, BRL, CBBTC, SUSDE, SYRUPUSDC and PRIME (all /USD), plus an Aave emergency count. **No equities, no BTC/ETH/SOL.** Chainlink lists no Tempo testnet feeds | `reference-data-directory.vercel.app/feeds-tempo-mainnet.json`; `smartcontractkit/documentation@b14cf1f:src/features/data/chains.ts:797-812`; `latestRoundData` on all 10 (§1.1) | [C] |
| 2 | Data Streams **VerifierProxy 2.0.0** `0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7` is on Tempo mainnet. Verifier 2.0.0 is `0xb86d1B8a3Bb1c5d7809F5E9EB009311D51d933c6`. `s_feeManager` = 0x0 and `s_accessController` = 0x0. Deployed at block 3,391,413 (2026-02-06) | `cast call … typeAndVersion()/s_feeManager()/s_accessController()`, proxy logs | [C] |
| 3 | The **same proxy, verifier and three config digests** are on Robinhood Chain mainnet (`0x00094bae…`, `0x0009ae36…`, `0x00097e7e…`) | `getVerifier(digest)` on both chains; verifier `ConfigSet` logs on both | [C] |
| 4 | **A real v11 SPY RegularHours report verifies on Tempo mainnet.** Result: mid 763.025, bid 762.99, ask 763.0632, `marketStatus` 2, `observationsTimestamp` 1788976800 (2026-09-09 18:00Z), ~93.4k gas | `eth_call proxy.verify(report, abi.encode(0x0))` on Tempo; report taken from Robinhood Chain tx `0x9bf9d7e6…f7f1` | [C] |
| 5 | Data Streams on Tempo mainnet has been used **once**: one `ReportVerified`, ETH/USD v3 stream `0x000362…3ae9`, on 2026-08-28. On Robinhood Chain the same verifier has **2,116** verifications, including SPY and AAPL v11 (25 each) | Full verifier log scans on both chains | [C] |
| 6 | Moderato has a separate VerifierProxy 2.0.0, `0x72790f9eB82db492a7DDb6d2af22A270Dcc3Db64`, with verifier `0xea373df1…65c5` and digest `0x00090d9e…bd69`. **A mainnet report reverts there** with `VerifierNotFound(0x00094bae…)` | `cast call`/logs on Moderato | [C] |
| 7 | Chainlink's Data Streams network list (57 networks) **does not list Tempo**, although Tempo's docs link the proxy | `documentation@b14cf1f:src/features/feeds/data/StreamsNetworksData.ts` (0 matches for "tempo"); `tempo-docs-md/docs__ecosystem__data-analytics.md:33` | [C] |
| 8 | Data Streams access: self-serve at app.chain.link, **"starting at $150/month"** per feed, bundles discounted, **"no free account tier"**, Stripe, 30-day cycles | `documentation@b14cf1f:src/content/data-streams/sign-up.mdx:29-30,100-101,129` | [C] |
| 9 | A report at a past timestamp: `GET /api/v1/reports?feedID=&timestamp=`. Report windows `[validFromTimestamp, observationsTimestamp]` are contiguous "with no gaps or overlap", so **exactly one report covers any T** | `…/data-streams/reference/data-streams-api/interface-api.mdx:76-92`; `…/how-report-timestamps-work.mdx` | [C] |
| 10 | Robinhood Chain: **34 Chainlink "Robinhood <T>/USD" push feeds**, `marketHours: us_equities_24/5`, 0.5% deviation, token price = share × `uiMultiplier`, no off-hours heartbeat. Includes TSLA, NVDA, AAPL, MSFT, META, GOOGL, AMZN, PLTR, AMD, SPY, QQQ, SPCX and SLV. **No NFLX, no gold ETF** | `feeds-robinhood-mainnet.json`; `latestRoundData` on all 34 (§1.4); `documentation@b14cf1f:…/tokenized-equity-feeds/robinhood.mdx` | [C] |
| 11 | **No CCIP lane between Tempo and Robinhood Chain.** Tempo connects to 11 chains and Robinhood to 8; neither lists the other | `documentation@b14cf1f:src/config/data/ccip/v1_2_0/mainnet/lanes.json` | [C] |
| 12 | RedStone push on Tempo: multi-feed adapter `0x368eE51E…7ca4` with 13 feeds: stables, yield dollars, BUIDL, cbBTC, WBTC. Moderato has USDC/EUROC only. **No equities** | `redstone-oracles-monorepo@1a70ec4:packages/relayer-remote-config/main/relayer-manifests-multi-feed/tempo{,Testnet}MultiFeed.json`; `latestRoundData` | [C] |
| 13 | RedStone gateway (`redstone-primary-prod`, 963 feeds, keyless) signs TSLA, NVDA, AAPL (each with `---EXTENDED`, `---PRE_AFTER` and `---24_7`); MSFT, META, GOOGL, AMZN (`---PRE_AFTER`, `---24_7`); **PLTR, AMD** (regular only); XAU, PAXG, XAUT, USA500.Y, USA100.Y, BTC, ETH, SOL. **Absent:** NFLX, SPY, QQQ, VOO, GLD, IAU, SPCX | `curl …/data-packages/latest/redstone-primary-prod` 12:28:39Z | [C] |
| 14 | RedStone packages carry **5 signatures** on a 10 s grid. TSLA signatures recover to the 5 `PrimaryProdDataServiceConsumerBase` signers **via Tempo mainnet's `ecrecover` precompile** | §2.3 | [C] |
| 15 | RedStone history reaches back 86,400 s but not 90,000 s (**~24 h**) | `…/data-packages/historical/redstone-primary-prod/<ms>` | [C] |
| 16 | RedStone signs **`NY_MARKET_NEXT_CHANGE_TIME`** (= 1789997400000 = Mon 13:30Z, the NYSE open), a signed market-calendar datapoint | same gateway response | [C] |
| 17 | RedStone Solidity sources are `SPDX: BUSL-1.1` and the monorepo LICENSE is BUSL 1.1 ("non-production use"), while `packages/evm-connector/package.json` says `MIT` | `redstone-oracles-monorepo@1a70ec4:LICENSE`, `…/contracts/data-services/PrimaryProdDataServiceConsumerBase.sol:1` | [C] |
| 18 | Chronicle on Tempo mainnet: 20 oracles (stables, yield dollars, CBBTC/PATHUSD, WBTC/PATHUSD, WETH/PATHUSD). Moderato: 38, including BTC/USD and ETH/USD. **No equities on Tempo.** Chronicle does run equities (AAPL, NVDA, SPY, QQQ, TSLA…) on Base mainnet and on testnets | `chroniclelabs.org/api/pairs` (1,381 rows); `chronicleprotocol/documentation@8368818:docs/Developers/testnet.md:397-436` | [C] |
| 19 | Pyth Core is on Tempo: mainnet `0x2880aB155794e7179c9eE2e38200202908C17B43`, Moderato `0x74f09cb3…e94E`, version **1.4.5-alpha.1**. Update fee: 0 on mainnet, 1 wei on Moderato. **No price feed exists on-chain** (BTC, ETH, SOL, XAU, TSLA, NVDA, AAPL, SPY, USDC all return `false`) | `pyth-crosschain@f06628c:contract_manager/src/store/contracts/EvmPriceFeedContracts.json`; `cast call` | [C] |
| 20 | **A post-upgrade Hermes TSLA blob (2026-09-18 20:00:00Z) reverts `InvalidWormholeVaa()` on Tempo mainnet.** The same blob verifies on Base Pyth 1.4.6 (TSLA 364.38 at `publish_time` T). Tempo's Wormhole still holds the 19-guardian set at index 7, while the blob is signed by guardian set 1 with 3 signatures | `pyth_sim.sh` / `pyth_base.sh` (§4) | [C] |
| 21 | Pyth Pro (Lazer) on Tempo: `0xACeA761c…F481`, v0.1.1, trusted signer `0x26fb61a8…85b9` valid to 2034-11-18, **`verification_fee` = 1 wei**. `verifyUpdate` with value 0 reverts "Insufficient fee provided"; with value 1 the node rejects with **"value transfer not allowed"** | `cast call`; `cast storage` slots 0–1 | [C] |
| 22 | Tempo refuses native value outright: `eth_call` with `--value 1` fails with `Revm error: value transfer not allowed`. Any oracle that charges `msg.value` is unusable | Probe; `tempo-docs-md/docs__guide__bridge-layerzero.md:540` | [C] |
| 23 | MPP Alpha Vantage: 26 endpoints at **8,000 units = $0.008** of USDC.e (`0x20c0…8b50`) per call. Payee `0x060b0fB0…9Ff0` on chain 4217 | `mpp.dev/api/services`; 402 challenge from `alphavantage.mpp.paywithlocus.com` | [C] |
| 24 | The MPP Alpha Vantage schema has **no `entitlement` field** (`additionalProperties: true`). Alpha Vantage's default without an entitlement is "historical data" (realtime and 15-min delayed need `entitlement=`). Direct Alpha Vantage terms are "personal, non-commercial use". **Freshness through MPP is unverified**: we did not pay for a call | `alphavantage.mpp.paywithlocus.com/openapi.json`; alphavantage.co/documentation; alphavantage.co/terms_of_service §2 | [C] / freshness unverified |
| 25 | **SpaceX is listed**: `SPCX`, Nasdaq (NMS), first trade 2026-06-12. Chainlink has SPCX Regular/Extended/Overnight streams and a Robinhood push feed. Agari still models `SPACEX` as a PreStocks pre-IPO name | Yahoo v8 chart meta; Cboe delayed quote; `feeds-robinhood-mainnet.json`; `agari-wt/w1@254f538:packages/core/src/market/tickers.ts:15` | [C] |
| 26 | Verifying a Data Streams report costs ~93,403 gas. At Tempo's base-fee floor of 6×10⁸ attodollars/gas that is ≈ **$0.000056**; at the cap of 1.2×10¹⁰ it is ≈ **$0.0011** | `cast estimate`; `tempo-docs-md/docs__protocol__fees__spec-fee.md:17,178-179` | [C] (arithmetic) |

---

## 1. Chainlink

### 1.1 Push Data Feeds on Tempo [C]

The Tempo docs point to the Chainlink directory (`tempo-docs-md/docs__ecosystem__data-analytics.md:29`).
`chains.ts:797-812` defines **only "Tempo Mainnet"**: `rddUrl
https://reference-data-directory.vercel.app/feeds-tempo-mainnet.json`, `supportedFeatures: ["feeds"]`,
and no testnet. The JSON (HTTP 200, cache age 125,170 s) has 10 entries. Each was read with
`cast call <proxy> "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url https://rpc.tempo.xyz`
at 12:22Z:

| Feed | Proxy | Heartbeat / dev. | Answer | updatedAt (UTC) |
|---|---|---|---|---|
| CBBTC / USD | `0x09025C12E6aA648a209f68B82839b786fbAea2d1` | 86400 s / 0.5% | 85,157.33 | 09-21 12:19:24 |
| EUR / USD | `0xc38FF24E34f9cdeC5ae3A1E5484e923D42cB7185` | 86400 / 0.5% | 1.148505 | 09-20 18:33:40 |
| CAD / USD | `0x99B330AF336fDb28DDC9F57c6aFc704DA686010a` | 86400 / 0.5% | — | 09-20 12:36:27 |
| BRL / USD | `0xD3d836BE1b2db70D56F4A6865595F23517032411` | 86400 / 0.5% | — | 09-21 12:16:53 |
| USDC / USD | `0xE82719304DE5B0416d97b12303bdaC7593ff601b` | 86400 / 0.5% | — | 09-21 05:44:40 |
| USDT / USD | `0x9b3a984d1abbe03845CBa7A895f1ff7f4209d59c` | 86400 / 0.5% | — | 09-21 05:43:24 |
| SUSDE / USD | `0xe660B4DC23430BdF2eC30b961fcAf6CCac8276a3` | 86400 / 0.5% | — | 09-21 05:41:07 |
| SYRUPUSDC / USD | `0x14150E642cA7392e33bB5F0141c131c1e5Ac1D10` | 86400 / 0.5% | — | 09-21 05:47:30 |
| PRIME / USD | `0xEd288826d3c2Dbb962534f4085073931aD7eeC93` | 86400 / 0.5% | — | 09-21 05:46:13 |
| AAVE Network Emergency Count (Tempo) | `0x0Bd931F734D4fA4F6e7566225Ce02B19996D8Ff4` | 86400 | — | 09-21 05:46:23 |

**There is no equity feed, and no BTC/ETH/SOL feed** (only CBBTC).

### 1.2 Data Streams on Tempo [C]

**Addresses and configuration**

| | Tempo mainnet | Moderato |
|---|---|---|
| VerifierProxy | `0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7`, "VerifierProxy 2.0.0", owner `0x4Dc905DD7398EAfad9ee0A777b92d65A3fdB979b`, deployed block 3,391,413 (2026-02-06 00:26Z) | `0x72790f9eB82db492a7DDb6d2af22A270Dcc3Db64`, "VerifierProxy 2.0.0", owner `0x354C0956…F44A`, block 3,936,250 (2026-02-06 21:24Z) |
| Verifier | `0xb86d1B8a3Bb1c5d7809F5E9EB009311D51d933c6`, "Verifier 2.0.0" | `0xea373df15066f5ba600e9a9c42e0677eca4b65c5` |
| Config digests (`ConfigSet` logs) | `0x00094baebfda9b87680d8e59aa20a3e565126640ee7caeab3cd965e5568b17ee` (02-06), `0x0009ae36d1dcb77db6e263632a30fa221aca4c5fc27636f4503fc1536cdaac8c` (05-21), `0x00097e7edb2c4d5a5787110573f962512c3ce37b1e7458b7cb18e9ada581cb69` (08-21) | `0x00090d9e8d96765a0c49e03a6ae05c82e8f8de70cf179baa632f18313e54bd69` |
| `s_feeManager` / `s_accessController` | `0x0` / `0x0`: **no on-chain fee, no allowlist** | `0x0` / `0x0` |

Proxy selectors, decoded with `cast selectors` and `cast 4byte`: `verify(bytes,bytes)` and
`verifyBulk(bytes[],bytes)` (both `payable`), `getVerifier(bytes32)`, `setVerifier`, `setFeeManager` and
`setAccessController`.

**Same deployment as Robinhood Chain.** Chainlink lists the Robinhood Chain mainnet proxy as
`0xcE73c8ad…36E7` and its testnet proxy as `0x72790f9e…Db64` (`StreamsNetworksData.ts:578-590`; the same
pair also serves Arc and X Layer). On Robinhood Chain, `typeAndVersion`, a zero fee manager, a zero access
controller, the verifier `0xb86d1B8a…33c6` and the same three `ConfigSet` digests all match Tempo.

**Verification test.**
1. Robinhood Chain tx `0x9bf9d7e68af55084a3a1738d3cae1d35a8eab85fbd09f80d6485525181ebf7f1` (block 68,272,301,
   2026-09-20 21:47Z) calls `post(bytes)` on `0x88a5…83d0`.
2. The embedded 1,152-byte payload's report context starts with digest `0x00094bae…`.
3. Replayed: `cast call 0xcE73…36E7 "verify(bytes,bytes)(bytes)" <payload> $(cast abi-encode "f(address)" 0x0) --rpc-url https://rpc.tempo.xyz`
   returns the report. Decoded as v11:

| Field | Value |
|---|---|
| feedId | `0x000bc7e431fcd497f06b9e1dea869bcda3d05049d0601f3d1e56e64c8cdd05ac` (SPY RegularHours) |
| validFromTimestamp = observationsTimestamp | 1788976800 = 2026-09-09 18:00:00Z (14:00 ET) |
| nativeFee / linkFee | 128346108383556 / 26675873177397016 (fields populated, **not charged**: no fee manager) |
| expiresAt | 1791568800 (+30 d) |
| mid / bid / ask | 763.025 / 762.99 / 763.0632 (18 dp) |
| bidVolume / askVolume / lastTradedPrice | 840 / 100 / 763.025 |
| marketStatus | **2 = Regular** |

The same call on Moderato reverts with `0xb151802b…`, i.e. `VerifierNotFound(0x00094bae…)`. **Mainnet
reports verify only on Tempo mainnet** [C]. Testnet reports need testnet credentials: Agari C:13 §3 says
"Testnet access: contact us". A self-serve route to them is unverified.

**Usage.** We scanned all verifier logs with `scanlogs.py`, in 100k-block `eth_getLogs` chunks. Mainnet
blocks 3,391,413 → 40,558,xxx held **1 `ReportVerified`**: feed `0x000362205e10b3a147d02792eccee483dca6c7b44ecce7012cb8c6e0b68b3ae9`
= "ETH/USD-RefPrice-DS-Premium-Global-003" (arbitrum RDD), requester `0xB1d06991Ec388EA23094Ea46fCeEd4f9DB44412A`,
block 36,941,562 (2026-08-28 22:12Z). Moderato held none. On Robinhood Chain the verifier logged 2,116
verifications: top feeds `0x00039f8a…b693` (1,113), BTC/USD v3 (898), ETH/USD v3 (55), **SPY v11 (25)** and
**AAPL v11 (25)**.

**Fees on Tempo.** None on-chain: the fee manager is `0x0`. It could not be native anyway (finding 22).
Billing is the off-chain subscription (§1.3). The deprecated pay-per-verification model is irrelevant
(`documentation@b14cf1f:src/content/data-streams/billing.mdx`).

### 1.3 Data Streams: which streams, which schema, access

Streams are chain-agnostic; a report fetched from the API verifies on any proxy carrying the signing DON's
digest. IDs come from `feeds-ethereum-mainnet-arbitrum-1.json`
(`contractType: "verifier"`, 321 entries with `assetClass: "Equities"`, all `status: live`). Regular-hours
v11 streams report `marketStatus` 0 Unknown / 2 Open / 5 Closed. The 24/5 streams (Extended, Overnight)
report 1 Pre / 2 Regular / 3 Post / 4 Overnight / 5 Closed. Docs: "Always use the `marketStatus` field…
Do **not** use `observationsTimestamp`…" (`…/data-streams/market-hours.mdx`).

| Ticker | RegularHours (v11) | ExtendedHours | OvernightHours | Other |
|---|---|---|---|---|
| TSLA | `0x000b2dbed1640ead18d37338b75e4755630a900649261baf4ed79d9a749be13d` | `0x000b9e87…4b07` (v11) | `0x000b6755…0107` | 24/7 v2 `0x0002b9e0…d324`; Timestamped `0x00084edc…17fa` |
| NVDA | `0x000b6aa036224454037bab103184565f6aa9ea589c3b349f6d8471ee753524b9` | `0x000bb043…2145` | `0x000b4798…88a9` | 24/7 v2 `0x0002d9b1…dae8` |
| AAPL | `0x000bbd87a23775b4c11092ae9a1fc7b3393636ae1dbb9f1ef460f845c0f4cff1` | `0x000b8b93…5b5b` | `0x000b313c…3c0b` | 24/7 v2 `0x000231a9…63df` |
| MSFT | `0x000bc4bcae3f338a2496aeee763156b999465bda826a3ccc94987d32a98212ab` | `0x000b473f…a9e` | `0x000bcff8…d6a` | 24/7 v2 `0x00029cf3…e6a5` |
| META | `0x000bc63e601958daafb805b1eecc3972a0ad231e8c08c0432961b7b5c3251166` | `0x000b2f98…2ee` | `0x000bd63d…7ef` | — |
| GOOGL | `0x000b1a2aa24db17599e5003a09bcd5e2a15ef66f79c2dca4dde108ab923b1e97` | `0x000ba0be…355` | `0x000b2630…cfb` | 24/7 v2 `0x00026b98…6ed4` |
| AMZN | `0x000bfb41659084e9ea0ea672b12b7878d88511dcac813d82435da65df946f65c` | `0x000b2544…868` | `0x000b9bba…693` | — |
| PLTR | `0x000b0a2a7bd663521a7e191c71c9e120825c0419445ac614fb9dcd3eafeb6298` | `0x000b0747…438` | `0x000b6f2c…af8` | — |
| NFLX | `0x000b826d0a21022b01a51b0b15e3fc173812e78ddc449a5069f13f2c1e652912` (schema blank in RDD) | `0x000ba38b…9a5` | `0x000bf452…9d5` | — |
| AMD | `0x000b122bc7189267b8c0f0759c71895809633b1aaa0c71ffb31f81ddb5d56849` | `0x000bdf6a…5c9` | `0x000b10cf…0fe` | — |
| SPY | `0x000bc7e431fcd497f06b9e1dea869bcda3d05049d0601f3d1e56e64c8cdd05ac` (**verified on Tempo**, §1.2) | `0x000b1a79…7301` | `0x000b0580…1bd3` | — |
| QQQ | `0x000bc47f698575ca7c80e92d0a9efe89a476266e000c0e13089ae92bc66c30b7` | `0x000b6f14…7dd7` | `0x000b59dc…dc91` | — |
| SPCX (SpaceX) | `0x000b4f3c6cbfd4f0ba9c635b5dd3b188338c98a3f6b595615ddfdb3a75dee647` | `0x000bcf66…84a8` | `0x000b5393…0b19` | 24/7 v2 `0x00020f37…9395`; EquityPrice v8 `0x0008b6d9…6d33` |
| IAU (gold ETF) | `0x000bd5e6003f74b7829f83401550a32d4f150842b99f07ad2e4d2bbf6647b045` | `0x000b3d84…a97f` | `0x000b2100…18eb` | — |
| GLD (gold ETF) | — | — | — | Timestamped only `0x000802acecf3ee05bc33c0af01b9fcc6b6fa6b4fdcbfe84d7bebedf81e193f76` (schema blank) |
| XAU spot | — | — | — | `XAU/USD-RefPrice-Timestamped` v8 `0x0008991d4caf73e8e05f6671ef43cee5e8c5c3652a35fde0b0942e44a77b0e89` (Forex/metals hours, v8 `marketStatus` 1 Closed / 2 Open) |
| BTC / ETH / SOL | — | — | — | v3 `0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509ada0c95ed75b8` / `0x000362205e10b3a147d02792eccee483dca6c7b44ecce7012cb8c6e0b68b3ae9` / `0x0003b778d3f6b2ac4991302b89cb313f99a42467d6c9c5f96f57c29c0d2bc24f` |

Full IDs for every elided cell are in the RDD JSON (`jq '.[] | select(.contractType=="verifier" and .docs.baseAsset=="TSLA")'`).
Also present: DIA, IWM, VTI, SLV, TLT, and 26 `TokenizedEquities` streams (xStocks/Ondo, not Robinhood).

**Access and cost** [C] (`sign-up.mdx`):
- Self-serve portal at app.chain.link; API key via "Create API Key".
- "Feed Selection — subscribe to individual feeds manually, starting at $150/month"; bundle plans are
  discounted (not priced publicly).
- "No free tier… All Data Streams subscriptions are paid"; Stripe checkout; activates instantly; 30-day cycles;
  cancellation takes effect at period end.
- Anyone with a card can do this; no hackathon credential was found (Agari C:13).
- **Per-lane arithmetic:** 9 RegularHours equity streams ≈ $1,350/mo list; each extra session
  (Extended, Overnight) is a separate stream [I from naming: separate feed IDs per session].
- REST endpoints (`interface-api.mdx`): `api.dataengine.chain.link` (mainnet),
  `api.testnet-dataengine.chain.link` (testnet). Routes: `/api/v1/reports?feedID&timestamp`,
  `/reports/latest`, `/reports/bulk?feedIDs&timestamp`.
- How far back `/reports?timestamp=` reaches is **unverified** (no key). The on-chain side has no expiry:
  a 12-day-old report still verified (§1.2).

### 1.4 Chainlink on Robinhood Chain [C]

`chains.ts:624-640` defines Robinhood Chain Mainnet only (`tags: tokenizedEquity`). `feeds-robinhood-mainnet.json`
(last-modified 2026-09-20 00:23Z) has 57 feeds: 34 "Robinhood" tokenized equities/ETFs, plus BTC, ETH,
CBBTC, WBTC, LBTC, BTC.B, LINK, ENA, stables and LST exchange rates. Every equity feed has
`marketHours: us_equities_24/5`, heartbeat 86400, deviation 0.5%, 8 decimals, `productTypeCode:
primaryTokenizedPrice`, `productSubType: calculatedPrice`, SVR (`path …-shared-svr`, with a
`secondaryProxyAddress`).

Live read (`latestRoundData`, Robinhood RPC, 12:26Z Monday; answer = **token price**):

| Ticker | Proxy | Answer | updatedAt (UTC) |
|---|---|---|---|
| TSLA | `0x4A1166a659A55625345e9515b32adECea5547C38` | 368.875 | 08:03:18 |
| NVDA | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` | 223.9084 | 12:26:04 |
| AAPL | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` | 335.5298 | 00:00:20 |
| MSFT | `0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E` | 495.2694 | 00:00:44 |
| META | `0x7C38C00C30BEe9378381E7B6135d7283356D71b1` | 679.3161 | 12:09:06 |
| GOOGL | `0xF6f373a037c30F0e5010d854385cA89185AE638b` | 350.878 | 11:29:24 |
| AMZN | `0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C` | 254.97 | 00:00:38 |
| PLTR | `0x820ABedFF239034956B7A9d2F0a331f9F075eB4c` | 179.5129 | 11:41:19 |
| AMD | `0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72` | 579.0157 | 12:13:14 |
| SPY | `0x319724394D3A0e3669269846abE664Cd621f9f6A` | 765.2925 | 00:00:26 |
| QQQ | `0x80901d846d5D7B030F26B480776EE3b29374C2ae` | 726.96 | 07:57:28 |
| SPCX (SpaceX) | `0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb` | 153.5776 | 11:11:30 |
| SLV | `0x209b73908e92Ae021826eD79609845451Ecba2ce` | 60.2482 | 11:55:05 |

Others: ASML `0xB4106147…87D`, BABA `0x62Cc8F9b…984`, CLSK `0x810c12D3…0eF`, COIN `0xA3a468A4…Ef2`,
CRCL `0x6652eDf6…482a`, CRWV `0xe1b3aABC…487C`, DELL `0x1C6c8cAD…206b`, EWY `0xEFdf5461…E1D1`,
GME `0x27C71df6…5B67`, INTC `0x3f390C5C…1913`, IONQ `0x22EfeC49…71eb`, MSTR `0x396118bd…c3D`,
MU `0x425EEFdC…d596`, NBIS `0xE1D87B11…9705`, ORCL `0x0e6a64a2…a844`, RGTI `0x2A045cF1…f765`,
RKLB `0x045477BF…CC74`, SGOV `0xa0DF4ee0…7A11`, SNDK `0xfb133Fa4…09A3`, TSM `0x874cF94a…Fc2F`,
USAR `0xA994d368…2DD9`, USO `0x75a9c76E…431c`.

**Not on Robinhood Chain:** NFLX (even though the Robinhood testnet faucet hands out NFLX tokens,
`11-stock-strategies-architecture.md`), GLD, IAU, and any gold product.

**Behaviour** (`robinhood.mdx`): the price is the underlying × `uiMultiplier()` read from the token. The
feed **freezes while `oraclePaused()`** during corporate actions. Off-hours "the feed may hold the last
published price… These feeds do not have heartbeats during off-hours."

Observed on Monday: AAPL, MSFT, AMZN, SPY and SGOV last updated at **00:00:2x UTC** (Sun 20:00 ET, the
overnight open) and nothing since. The 0.5% deviation was not crossed, so a push value can be **hours
old in-session** [C]. That rules the feed out as a boundary print for 5-, 15- or 60-min Windows; it is
fine as a valuation reference [I].

**Relay to Tempo.** CCIP `lanes.json` has no `tempo-mainnet ↔ robinhood-mainnet` lane [C]. Any relay would
be keeper-attested or go over LayerZero; that is research-bridge's area. It is unnecessary for the
*underlying* price, because Data Streams verify natively on Tempo (§1.2). It is needed only for
**`uiMultiplier`**, which belongs on the stock-token bridge channel (research-bridge / `11-…` Layer 1) [I].

---

## 2. RedStone

### 2.1 Push feeds on Tempo [C]

`tempoMultiFeed.json`: chain 4217, `adapterContract 0x368eE51E47a594fe1E9908b48228748a30BC7ca4`
(`multi-feed`), `dataServiceId redstone-primary-prod`, triggers 0.5% / 6 h (with overrides). Its 13 feeds:
cUSD_FUNDAMENTAL, USDC `0x4aF6b78d…7a78`, USDT0, EUROC, sUSDe_FUNDAMENTAL, pathUSD `0xf5528a63…4753`,
cbBTC `0x6b1E20c8…9084`, WBTC `0xb81131B6…C2Db`, syrupUSDC_FUNDAMENTAL, stcUSD_FUNDAMENTAL,
BUIDL_FUNDAMENTAL, BUIDL_DAILY_INTEREST_ACCRUAL, BRSRV_TEMPO_FUNDAMENTAL.

Live reads: cbBTC 85,182.04 (12:21:12Z), WBTC 85,247.92 (12:35:57Z), pathUSD 1.00000000 (07:36Z),
USDC 0.99986 (07:35Z).

Moderato (`tempoTestnetMultiFeed.json`): adapter `0x65d0F14f7809CdC4f90c3978c753C4671b6B815b`, one feed,
USDC/EUROC `0xE94c9f9A…f8C` (0.87128, 07:11Z). **No equity, ETH or SOL push feed on either network.**

### 2.2 Pull model on EVM (what a Tempo contract does)

- Package: `@redstone-finance/evm-connector` 1.0.0 (npm modified 2026-08-31).
- Base contract: `PrimaryProdDataServiceConsumerBase` (`redstone-oracles-monorepo@1a70ec4:packages/evm-connector/contracts/data-services/PrimaryProdDataServiceConsumerBase.sol:8-32`):
  - `getDataServiceId()` returns **`"redstone-primary-prod"`**.
  - `getUniqueSignersThreshold()` returns **3**.
  - Authorised signers, by index:
    - 0 `0x8BB8F32Df04c8b654987DAaeD53D6B6091e3B774`
    - 1 `0xdEB22f54738d54976C4c0fe5ce6d408E40d88499`
    - 2 `0x51Ce04Be4b3E32572C4Ec9135221d0691Ba7d202`
    - 3 `0xDD682daEC5A90dD295d14DA4b0bec9281017b5bE`
    - 4 `0x9c5AE89C4Af6aA32cE58588DBaF90d18a855B6de`
- **These are exactly Agari's five Solana signers**
  (`agari-wt/w1@254f538:services/ops/config/price-sources.json` `redstone.signersObserved_2026-09-13`).
- Feed IDs are left-aligned ASCII bytes32 (`"TSLA"`), so **Agari's feed IDs and data service carry over to
  EVM unchanged** [C].
- The payload is appended to calldata. All packages must share one timestamp (`TimestampsMustBeEqual`).
  The median is aggregated (`RedstoneConsumerBase.sol:87-155`).
- **Default timestamp rule:** the data may be at most **3 min old / 1 min ahead** of `block.timestamp`
  (`RedstoneDefaultsLib.sol:12-13,18-34`).
  - For settlement at a past T, **override `validateTimestamp`** to require `timestamp_ms == T·1000`.
    This is Agari's rule (`docs/plan/specs/prints.md:154`, D-007). It lets a late post settle correctly [I].
- Cost: no on-chain oracle fee. Gas is 3–5 `ecrecover` plus calldata; not measured on Tempo, estimated
  < 100k gas ≈ < $0.0012 even at the cap [I].

### 2.3 Proof that the primitive works on Tempo [C]

- Took the 5 live `TSLA` packages (timestamp 1789993710000).
- Serialised each exactly as RedStone signs it: `feedId(32) ‖ value×10⁸(32) ‖ ts_ms(6) ‖ 32(4) ‖ 1(3)`.
- Hashed with `cast keccak` and called Tempo mainnet precompile `0x…01` with `hash ‖ v ‖ r ‖ s`.
- **All five recover to the listed signers** (`0xDD682daE…`, `0x51Ce04Be…`, `0x8BB8F32D…`, `0xdEB22f54…`,
  `0x9c5AE89C…`). A control test recovered a locally signed message correctly.
- A full `evm-connector` consumer deployment on Tempo was **not** run.

### 2.4 Equity coverage and closed-market behaviour [C]

Gateway `https://oracle-gateway-2.a.redstone.finance/data-packages/latest/redstone-primary-prod`, 12:28:39Z.
Medians of 5 signers, timestamp 1789993710000:

| Feed | Regular | `---EXTENDED` | `---PRE_AFTER` | `---24_7` | Cboe official close Fri 09-18 |
|---|---|---|---|---|---|
| TSLA | 364.3058 | 369.3036 | 369.3036 | 369.3036 | 364.27 (+0.8 bp vs regular) |
| NVDA | 222.0018 | 223.7410 | 223.7410 | 223.7410 | 222.27 (**−12 bp**) |
| AAPL | 335.9180 | 336.1268 | 336.1268 | 336.1268 | 336.13 (−6 bp) |
| MSFT | 493.5540 | — | 495.2974 | 495.2974 | — |
| META | 665.3906 | — | 678.9533 | 678.9533 | — |
| GOOGL | 349.0942 | — | 350.6864 | 350.6864 | — |
| AMZN | 253.5998 | — | 255.1953 | 255.1953 | — |
| PLTR | 177.6281 | — | — | — | — |
| AMD | 559.6543 | — | — | — | — |
| NFLX, SPY, QQQ, VOO, IWM, DIA, GLD, IAU, SLV, COIN, MSTR, HOOD, CRCL, SPCX | **absent** | | | | |
| Index / commodity | USA500.Y 7,696.77 (+`---24_7`), USA500.T 7,720.86, USA100.Y 29,933.63, USA100.T 30,000.13, XAU 4,352.55, XAU.T 4,354.84, PAXG 4,348.83, XAUT 4,352.73, XAG 66.41, XPT 1,810.67, WTI.Y | | | | |

- **When NYSE is closed, the regular feed keeps being signed** every 10 s, holding the last regular-session value.
  TSLA was 364.287–364.488 in the historical packages at T−86,400 s (Sun 12:29Z), T−43,200 s and T−3,600 s.
  The session variants move pre-market.
- The held value is **not** the official close (NVDA −12 bp). Agari's "oracle price at 16:00:00 ET, never
  'official close'" labelling carries over (`prints.md:270`).
- Agari measured RedStone vs Pyth at 0.2 bp at the 09-11 close and 5.2 bp at the 09-14 open (D-052).
- **Thin quorum at the open:** on 09-14, MSFT, META, AMZN and GOOGL had exactly 3 signers at 09:30:00 ET, and
  5 by 09:30:10 (D-052).
- **Retention:** 86,400 s back returns packages; 90,000 s back returns `{"statusCode":513,"message":"Data packages response is empty"}`.
  Friday's 16:00 packages were already gone at probe time. **A keeper must archive prints within ~24 h**
  (Agari's `print_archive`, D-054).
- Signed calendar datapoints: `NY_MARKET_NEXT_CHANGE_TIME` = 1789997400000 (Mon 13:30Z, the open), plus
  `CME_…`, `ICE_…`, `FOREX_…`, `JPX_…` and `KRX_MARKET_NEXT_CHANGE_TIME`. A contract can check a signed
  "next change" time instead of a hard-coded calendar [I].
- **Semantics unverified:** `---PRE_AFTER` vs `---EXTENDED` vs `---24_7` (identical on Monday pre-market);
  `.Y` vs `.T` index suffixes.

**Licence.** The Solidity is `BUSL-1.1` and the monorepo LICENSE grants "non-production use", with no
Additional Use Grant text in the root file, while `evm-connector/package.json` says `MIT`. The public
gateway's data terms are unverified (as in Agari C:13). **Owner question** before a mainnet claim.

---

## 3. Chronicle [C]

Tempo docs: "DeFi Price Feeds… Proof of Asset" (`docs__ecosystem__data-analytics.md:37-45`). Chronicle's
blog says it covers Tempo "starting with pathUSD" for Morpho
(chroniclelabs.org/blog/chronicle-brings-verified-oracle-data-to-tempo-s-ecosystem). The dashboard API
`chroniclelabs.org/api/pairs` (read in a browser; 1,381 rows) lists **Tempo mainnet**, 20 rows, interval
1,800 s, spread 0.15%:

| Pair | Address |
|---|---|
| CBBTC/PATHUSD | `0x3e5c5A11a854540167B3860E50A635f2A9875B18` |
| WBTC/PATHUSD | `0xc878A10F1367E9F76c7E9A851544b5338752cb23` |
| WETH/PATHUSD | `0x480B086C884bf0bc7D6fAc85278f98042d115087` |
| USDC/USD | `0x12510D24143c0E0A0372176e8E9AEB92c64F4a74` |
| USDS/USD · USDT0/USD · SUSDE/USD · SUSDE/USDE · SYRUPUSDC/USD · IUSD/USD · SIUSD/USD · SIUSD/IUSD · SPUSDC/USD · SRUSD/USD · SRUSDE/USD · STCUSD/USD · SAVUSD/AVUSD · WSRUSD/USD · WSRUSD/RUSD | `0xba47…620F` · `0xA212…5Ea1` · `0x1A31…dc97` · `0x2A52…64E4` · `0xCE35…f950` · `0x1CaB…0A70` · `0x7754…4BeA` · `0x7f5C…A9C3` · `0xc5FD…9242` · `0x04f2…f9A7` · `0xa9Cc…75b8` · `0x5A37…CCEb` · `0x1816…B25C` · `0xF67B…d03a` · `0x93Ac…0704` |
| PATHUSD/USD | listed with no address |

**Moderato** has 38 oracles (`testnet.md:397-436`), including BTC/USD `0x1Fb325AaD4beB3082123406964b7F3F7a4309908`
and ETH/USD `0xA4a5bF1E9202cF48a2FD0b3FE0C09909De84b8a9`. ETH/USD read 2,723.92 at 1789993660 via
off-chain `latestRoundData` from `address(0)`. Contracts self-whitelist through SelfKisser
`0x617FF3943b4678Bf70F5D254B02407D1F29B2B55`. There is **no SOL and no equity** on either Tempo network.

- **Mainnet reads need whitelisting**: "the address making the request must be whitelisted to obtain read
  access" (`readingFromOracles.md:36`). Only testnets have a SelfKisser.
- Chronicle *does* publish equities (AAPL, AMZN, COIN, HOOD, META, MSFT, NFLX, NVDA, ORCL, PLTR, QQQ, SPY, V,
  JPM, …) on **Base mainnet** and 14 testnets, but not on Tempo. It offers custom deployments to issuers and
  curators ("Contact us at hello@chroniclelabs.org"). A Tempo equity deployment on request is possible but
  unverified [I].

---

## 4. Pyth [C]

**Deployments** (`pyth-crosschain@f06628c:contract_manager/src/store/`):

| | Tempo mainnet | Moderato |
|---|---|---|
| Core (`EvmPriceFeedContracts.json`) | `0x2880aB155794e7179c9eE2e38200202908C17B43`, v"1.4.5-alpha.1", `singleUpdateFeeInWei` **0**, `validTimePeriodSeconds` 60 | `0x74f09cb3c7e2A01865f424FD14F6dc9A14E3e94E`, v"1.4.5-alpha.1", fee **1 wei** (`getUpdateFee` = 3 for a 3-feed blob) |
| Wormhole | `0xb27e5ca259702f209a29225d0eDdC131039C9933` (current guardian set index 7, 19 guardians) | `0x41955476936DdA8d0fA98b8d1778172F7E4fCcA1` (same) |
| Pro/Lazer (`EvmLazerContracts.json`) | `0xACeA761c27A909d4D3895128EBe6370FDE2dF481`, v"0.1.1", impl `0xbe065fb0…8a64` | same address and config |
| Executor | `0x98046Bd2…8603` | `0x8D254a21…1933` |

- `EvmChains.json` has `tempo` (4217, `rpc.mainnet.tempo.xyz`) and `tempo_testnet` (42431).
- The docs' EVM page renders these from a component, so the `.md` twin has no addresses.
- **Nothing pushed:** `priceFeedExists` is false on both networks for BTC, ETH, SOL, XAU, TSLA, NVDA, AAPL,
  SPY and USDC. **There are no sponsored push feeds on Tempo.**

**Core cannot verify current Hermes data on Tempo.** The input is Agari's archived trial blob for Fri
2026-09-18 20:00:00Z (`/Users/abu/dev/hackathon/stocklana/data/archive/pyth/2026-09-18.jsonl`; PNAU; VAA
guardian set 1, 3 signatures).

| Contract | Call | Result |
|---|---|---|
| Tempo mainnet | `parsePriceFeedUpdatesUnique(…, [TSLA], T, T+5)` and `updatePriceFeeds` | revert `0x2acbe915` = **`InvalidWormholeVaa()`** |
| Moderato | `parsePriceFeedUpdatesUnique` | revert `InsufficientFee()` (1-wei fee, unpayable) |
| Base (control, `0x8250f4aF…487a` v1.4.6) | `parsePriceFeedUpdatesUnique` | TSLA **364.38000**, conf 0.09288, `publish_time` 1789761600 |

Pyth says EVM Core contracts were "upgraded in place" on 2026-08-26 and that `hermes.pyth.network` now serves
the upgraded backend (`docs.pyth.network/price-feeds/core/upgrade/contracts.md`). Tempo's contract (1.4.5-alpha.1,
Wormhole guardians) evidently was not: **current Hermes payloads do not verify on Tempo**. We found no
public source of the old Wormhole-signed payloads; that is unverified.

**Pyth Pro on Tempo.**
- Trusted signer slot 0 = `0x26fb61a864c758ae9fba027a96010480658385b9`, expiry 2,047,480,744 (2034-11-18).
  `isValidSigner` returns true. It is the same signer as Base's Lazer contract.
- `verification_fee` = 1 wei (`PythLazer.sol:26,107`: `require(msg.value >= verification_fee)`).
- On Tempo, value 0 reverts "Insufficient fee provided" and value 1 is refused by the node. **`verifyUpdate`
  is uncallable.**
- **Workaround [I]:** verify the Lazer ECDSA payload in our own contract, then call the free view
  `isValidSigner(signer)` on `0xACeA…F481`. That uses Pyth's on-chain signer registry without paying the fee.
  Untested.
- Data access is paid regardless. US equities need Pro (from $2,500/mo; US Equities bundle $5,000/mo), and
  the only cheap route was the Polymarket package at $99/mo (Agari C:13 §1(b)).

**Can we deploy our own?** Pyth's EVM contracts are open source, and verification is purely cryptographic.
Anyone *can* deploy a Core contract configured with the upgraded router set and data source, or a Lazer
verifier [I]. Whether Pyth's data licence permits it is unverified; Pro grants "Limited redistribution
rights" (Agari C:13). Cleaner: **ask Pyth** (`data@dourolabs.xyz`) to upgrade Tempo Core and set the Lazer
fee to 0.

---

## 5. Crypto prices on Tempo (BTC, ETH, SOL)

| Provider | Tempo mainnet | Moderato | Model | Cost | |
|---|---|---|---|---|---|
| Chainlink push | CBBTC/USD only | none | push, 24 h / 0.5% | free read | [C] |
| Chainlink Data Streams | BTC `0x00039d9e…75b8`, ETH `0x000362…3ae9`, SOL `0x0003b778…c24f` (v3); **ETH already verified on Tempo 2026-08-28** | testnet creds required | pull, sub-second | $150/stream/mo | [C] |
| RedStone pull | BTC 85,000.08, ETH 2,718.10, SOL 116.18 (5 signers, 10 s grid) | same (chain-agnostic) | pull | $0 | [C] data; [I] consumer on Moderato |
| RedStone push | cbBTC, WBTC | none | push, 0.5% / 24 h | free read | [C] |
| Chronicle | CBBTC/PATHUSD, WBTC/PATHUSD, WETH/PATHUSD (whitelist) | BTC/USD, ETH/USD, WETH/USD (SelfKisser) | push, 30 min / 0.15% | free (whitelist) | [C] |
| Pyth | contract present, no feeds, Hermes payloads fail | fee unpayable | — | — | [C] |
| MPP | CoinGecko `simple-price` $0.06; Alpha Vantage `crypto-exchange-rate` $0.008; Allium `prices/at-timestamp` $0.02 | — | off-chain | per call | [C] prices |

---

## 6. MPP-paid off-chain data

**Catalog.** `GET https://mpp.dev/api/services` returns `version 1` with 142 services. The market-data
entries:

| Service | Endpoint base | Price per call | Notes |
|---|---|---|---|
| **Alpha Vantage** (third-party via Locus) | `https://alphavantage.mpp.paywithlocus.com/alphavantage/` | **$0.008** (8,000 × 10⁻⁶ USDC.e) | 26 POST endpoints: `time-series-intraday` (1–60 min, `extended_hours` default true, `month=YYYY-MM`, 20+ years), `time-series-daily/weekly/monthly`, `global-quote`, `market-status`, `symbol-search`, `top-gainers-losers`, `news-sentiment`, fundamentals, `currency-exchange-rate`, `fx-daily`, `crypto-exchange-rate`, `digital-currency-daily`, `commodity-price`, `economic-indicator`, SMA/EMA/MACD/RSI/BBANDS |
| CoinGecko (Locus) | `coingecko.mpp.paywithlocus.com` | $0.06 | 15 endpoints incl. `simple-price`, `coin-history`, `market-chart` |
| Allium | `agents.allium.so` | $0.02 | `prices`, `prices/at-timestamp`, `prices/history` (token prices) |
| Codex | `graph.codex.io` | $0.001 | GraphQL token prices, trades |
| Alchemy | `mpp.alchemy.com` | $0.0001–0.0005 | RPC, Prices API |
| EDGAR / Exchange Rates / Wolfram\|Alpha | Locus | $0.008 / $0.006 / $0.055 | filings / FX / compute |

The Tempo docs list Alpha Vantage, CoinGecko, EDGAR, EDGAR Full-Text and Exchange Rates
(`docs__guide__machine-payments__use-cases__financial-data.md:17-21`). We found **no Pyth, Polygon/Massive,
Finnhub, Twelve Data or Databento** in the catalog [C].

**402 challenge** (unpaid probe, `POST …/global-quote {"symbol":"TSLA"}`): `HTTP 402`,
`www-authenticate: Payment … method="tempo", intent="charge"`, with request
`{"amount":"8000","currency":"0x20c000000000000000000000b9537d11c60e8b50","methodDetails":{"chainId":4217},"recipient":"0x060b0fB0Be9d90557577B3AEE480711067149Ff0"}`.
The currency token is `USDC.e` ("Bridged USDC (Stargate)") by `symbol()` and `name()` [C]. The OpenAPI
says a 200 carries "PAYMENT-RESPONSE and durable request receipt".

**Realtime or delayed? Unverified.**
- Alpha Vantage's `entitlement` parameter decides freshness: unset means "historical data"; `realtime` or
  `delayed` means 15-min delayed.
- Locus's schema does not list it but allows extra properties.
- Answering this needs **one paid call** ($0.008 from the owner's wallet), which we did not make. For example,
  `tempo request alphavantage.mpp.paywithlocus.com/alphavantage/time-series-intraday -d '{"symbol":"TSLA","interval":"1min","entitlement":"realtime"}'`,
  then compare the last bar's timestamp with the clock.

**Licensing.** Alpha Vantage ToS §2(a) grants "personal, non-commercial use". It defines commercial use as
including providing information "as part of any type of commercial activity that allows individuals or
entities other than User to access information directly or indirectly". Publishing prints on-chain for a
market fits that description [I]. Locus's reseller terms are unreviewed. Agari C:13 §4.1 has the
exchange-policy background: delayed SIP on public chains needs approval; end-of-day is lenient.

**Could an attested MPP read serve as a settlement print?**
- The MPP receipt proves *that we paid* for request X (a TIP-20 transfer on Tempo, ~500 ms). It does **not**
  sign the response body.
- The price therefore reaches the chain only as **our keeper's attestation**: an ed25519/secp256k1
  signature over `(ticker, T, value, request-id, payment tx)`. That is Agari's `SOURCE.attested` trust
  model (D-100/D-101: single-source, venue-signed, labelled).
- Its only improvements over a free API are auditability (the paid request is on-chain and can be matched
  to a receipt) and no API-key custody.
- Trust = the keeper key + Alpha Vantage's number + an unknown freshness. **Use it as a labelled demo or
  fallback print, or a check source, never as the unlabelled primary** [I].
- zkTLS/TEE attestation of the HTTPS response would lift this. None is on Tempo today; unverified.

---

## 7. Coverage matrix

Push and pull are marked **P** and **L**. "RH" = Robinhood Chain. Latency: DS = sub-second reports,
~1–2 s delivery (`how-report-timestamps-work.mdx`); RS = 10 s grid; RH push = 0.5% deviation with no
off-hours heartbeat (observed 0–12.4 h old at 08:26 ET); Chronicle = 30 min / 0.15%. For DS, "Reg/Ext/ON"
means Regular, Extended and Overnight v11 streams exist.

| Ticker | CL Data Streams (L) — Tempo mainnet / Moderato / RH | CL push (P) — Tempo / RH | RedStone (L) — Tempo main & Moderato | RedStone push Tempo | Pyth on Tempo | Chronicle Tempo | AV via MPP (off-chain) |
|---|---|---|---|---|---|---|---|
| TSLA | Reg/Ext/ON + 24/7 v2 · ✅ / creds / ✅ | — / ✅ 24/5 token | ✅ reg + EXT, PRE_AFTER, 24_7 | — | ✖ | — | ✅ (freshness ?) |
| NVDA | Reg/Ext/ON + 24/7 · ✅ / creds / ✅ | — / ✅ | ✅ reg + EXT, PRE_AFTER, 24_7 | — | ✖ | — | ✅ |
| AAPL | Reg/Ext/ON + 24/7 · ✅ / creds / ✅ | — / ✅ | ✅ reg + EXT, PRE_AFTER, 24_7 | — | ✖ | — | ✅ |
| MSFT | Reg/Ext/ON + 24/7 | — / ✅ | ✅ reg + PRE_AFTER, 24_7 | — | ✖ | — | ✅ |
| META | Reg/Ext/ON | — / ✅ | ✅ reg + PRE_AFTER, 24_7 | — | ✖ | — | ✅ |
| GOOGL | Reg/Ext/ON + 24/7 | — / ✅ | ✅ reg + PRE_AFTER, 24_7 | — | ✖ | — | ✅ |
| AMZN | Reg/Ext/ON | — / ✅ | ✅ reg + PRE_AFTER, 24_7 | — | ✖ | — | ✅ |
| PLTR | Reg/Ext/ON | — / ✅ | ✅ reg only | — | ✖ | — | ✅ |
| AMD | Reg/Ext/ON | — / ✅ | ✅ reg only | — | ✖ | — | ✅ |
| NFLX | Reg/Ext/ON | — / **✖** | **✖** | — | ✖ | — | ✅ |
| SPY | Reg/Ext/ON (**Reg verified on Tempo**) | — / ✅ | **✖** (proxy: USA500.Y / .T, semantics ?) | — | ✖ | — | ✅ |
| QQQ | Reg/Ext/ON | — / ✅ | **✖** (proxy: USA100.Y / .T) | — | ✖ | — | ✅ |
| SPCX (SpaceX, listed 2026-06-12) | Reg/Ext/ON + 24/7 | — / ✅ | ✖ | — | ✖ | — | likely ✅ (unverified) |
| Gold: XAU spot | Timestamped v8 (metals hours) | — / ✖ | ✅ XAU, XAU.T, PAXG, XAUT (24/5-ish, semantics ?) | — | ✖ | — | `commodity-price` (granularity ?) |
| Gold ETFs GLD / IAU | GLD Timestamped only; IAU Reg/Ext/ON | — / ✖ (SLV only) | ✖ | — | ✖ | — | ✅ |
| Pre-IPO (OpenAI, Anthropic, …) | ✖ | ✖ | ✖ | — | ✖ | — | ✖ |
| BTC / ETH / SOL | v3 (ETH verified on Tempo) | CBBTC only / BTC, ETH | ✅ | cbBTC, WBTC | ✖ | CBBTC, WBTC, WETH /PATHUSD (main); BTC, ETH (Moderato) | ✅ ($0.008) |

✅ = available and signed/verifiable on that network (for AV: available, unsigned). "creds" = needs
Chainlink testnet credentials. ✖ = none. Market-hours behaviour:
- **DS:** `marketStatus` in every v11 report; Regular streams use 2 / 5.
- **RS regular:** keeps signing the held last value when closed; variants move in the extended sessions.
- **RH push:** holds the last value, no off-hours heartbeat, freezes on `oraclePaused`.
- **AV `market-status` endpoint:** $0.008.

---

## 8. Resolution design implications

**What Agari uses** (`agari-wt/w1@254f538`):
- **Price-source matrix** (D-003; `services/ops/config/price-sources.json`):
  - TSLA: Pyth primary + RedStone check until 2026-09-25 20:00Z, then **RedStone** alone.
  - QQQ/VOO: Pyth until the trial ends, then **"paused: no signed source"**.
  - NVDA, AAPL, MSFT, META, AMZN, GOOGL: **RedStone**, open-ended.
- **Token lane:** Switchboard Surge xStock prices.
- **Pre-IPO:** attested PreStocks `tokenPrice`, single-source and labelled (D-100/101/103).
- **Print** = the source's price *at* the boundary T (`prints.md`):
  - Pyth: `prev_publish_time < T ≤ publish_time ≤ T + 5 s`.
  - RedStone: every package `timestamp_ms == T·1000` (10 s grid), N ≥ 5 within 300 s, then N ≥ 3 to 900 s.
  - Cross-check divergence over **25 bp voids**.
  - Close ≥ open → Up (PD-3).
- **Session close:** "oracle price at 16:00:00 ET", never "official close".
- **Gap:** the Fri 16:00:00 ET print vs the Mon 09:30:00 ET print on the **regular** feed ID. That is the
  first regular-session print, not the opening cross (D-052). The Friday print is admitted until `lock_at`
  (Sun 20:00 ET), so it must be archived within RedStone's ~24 h (D-054).
- **Halts and voids** (D-057): a missing print or a divergence voids at 0.5/0.5, with the reason named.

**What a Tempo engine can use, per source** [I unless stated]:

| Source on Tempo | Print rule (on-chain) | Unique? | Late settle? |
|---|---|---|---|
| RedStone pull | Override `validateTimestamp`: `ts == T·1000`, ≥ 3 distinct authorised signers, feed id pinned | Yes: one 10 s-grid timestamp; values can differ per signer, the median is deterministic for a given signer set; Agari requires every posted package to verify (D-007) | Yes, if archived (≤ ~24 h at the gateway) |
| Chainlink Data Streams v11 | `verify()` then require `feedId` pinned, `validFromTimestamp ≤ T ≤ observationsTimestamp`, `marketStatus == 2` for Regular Windows (or the session the Window was created for) | **Yes by construction**: windows "contiguous… no gaps or overlap" [C docs] | Yes: fetch `/reports?timestamp=T` any time (API retention unverified); the verifier has no expiry [C] |
| Robinhood push (relayed) | round with `updatedAt ≤ T <` next round | Yes, but up to 0.5% stale | Needs relay; no CCIP lane |
| Chronicle push | same | coarse (30 min / 0.15%) | whitelist |
| MPP attested | keeper signature over `(T, value, request id, payment tx)` | as unique as the keeper | yes |

- **Regular Windows (09:30–16:00 ET):** RedStone regular IDs, as Agari does. Data Streams RegularHours adds a
  machine-checked `marketStatus == 2`, which RedStone lacks. With RedStone, gate on the calendar: Agari's
  keeper, or RedStone's signed `NY_MARKET_NEXT_CHANGE_TIME`.
- **Closing print 16:00:00 ET:** the Data Streams regular report whose window contains 16:00:00, or the
  RedStone 16:00:00 package. Both are "oracle price at 16:00:00", not the official close (NVDA held-value
  gap −12 bp).
- **Gap (Fri close → Mon open):** Data Streams is structurally better, because the Friday report can be
  fetched on Monday and verified. RedStone requires archiving before ~24 h.
- **24/7 lanes:**
  - Crypto: RedStone exact-T.
  - "Stock 24/7": RedStone `---24_7` (7 names) or DS `Streams-247` v2 (TSLA, NVDA, AAPL, MSFT, GOOGL, SPCX),
    labelled as that provider's 24/7 price, not the stock (Agari C:13 §6.4 wording).
  - Stock-token lane: the Tempo Uniswap v4 pool of the bridged token (TWAP; thin, capped).

---

## Recommendation (per lane)

| Lane | Primary | Fallback / check | Cost | Network |
|---|---|---|---|---|
| **Regular Windows, single names** (TSLA, NVDA, AAPL, MSFT, META, GOOGL, AMZN, PLTR, AMD) | **RedStone pull**, regular feed ID, `ts == T·1000`, ≥ 3 of 5 signers | **Chainlink Data Streams v11 RegularHours**, window ∋ T, `marketStatus == 2`; divergence > 25 bp voids (Agari D-003); missing check → `single_source` flag | RedStone $0 (licence caveat). DS $150/stream/mo → $1,350/mo for all 9, or start with 1–2 flagships ($150–300) as Agari C:13 §6.5 suggests. Verify gas ≈ $0.00006–0.0011 | Tempo mainnet (both); Moderato RedStone-only |
| **Regular Windows, NFLX / SPY / QQQ / IAU / SPCX** | **Chainlink Data Streams v11 RegularHours** (the only signed source on Tempo) | Alpha Vantage via MPP, keeper-attested and **labelled "demo, single-source"**, or pause honestly as Agari does ("paused: no signed source") | $150/stream/mo; AV $0.008/call (≈ 79 boundaries × 21 d × 5 tickers ≈ 8.3k calls ≈ $66/mo) | Tempo mainnet |
| **Closing print (16:00:00 ET)** | Same source as the Window's primary at T = 16:00:00 | Same check. Label "oracle price at 16:00:00 ET" | as above | — |
| **Weekend Gap (Fri 16:00 → Mon 09:30)** | **Data Streams** (Friday report fetched at settle time) for any subscribed ticker | RedStone regular feed; keeper archives the Fri 16:00:00 packages immediately (≤ 24 h) | as above | Tempo mainnet |
| **24/7 crypto (BTC, ETH, SOL)** | **RedStone pull** exact-T | Data Streams v3 (paid); Chronicle mainnet WETH/PATHUSD and CBBTC/PATHUSD as a sanity band (whitelist) | $0 / $150 per stream | mainnet + Moderato (RedStone) |
| **24/7 stock price lane** | RedStone `<T>---24_7`, labelled "RedStone 24/7 TSLA" | DS `Streams-247` v2 | $0 / $150 | — |
| **Stock-token reference** (v4 oracle-band hook, themed-portfolio valuation) | Underlying from **Data Streams** (Reg + Ext + ON, keyed by `marketStatus`) or RedStone `---EXTENDED`/`---24_7`, × **`uiMultiplier` mirrored from the Robinhood token over the bridge**. The keeper writes a verified price into a small on-chain store the hook reads with staleness and session checks, or the report rides in `hookData` [I] | Tempo pool TWAP as a sanity band; RH push value (off-chain read) for display | DS streams already counted; multiplier channel is research-bridge's | Tempo mainnet |
| **Pre-IPO** | **SpaceX moves to the listed lanes (SPCX).** The others have no source on Tempo: keeper-attested PreStocks/issuer mark, labelled single-source (Agari D-101) | none | $0 | — |

**Moderato:**
- RedStone pull is the only signed equity source that works (production data on a testnet chain [I]).
- Data Streams needs testnet credentials; mainnet reports fail there [C].
- Pyth is blocked; Chronicle has no equities.
- Build and test the RedStone path on Moderato and run Streams on mainnet.

## Blockers

1. **Pyth is unusable on Tempo today.**
   - Core 1.4.5-alpha.1 rejects current Hermes payloads (`InvalidWormholeVaa`).
   - Lazer's 1-wei fee cannot be paid (no `msg.value` on Tempo).
   - No feeds are pushed, and equities need the Pro plan anyway.
2. **Data Streams is paid and mainnet-only:** $150/stream/mo with no free tier. Testnet reports need
   credentials that are not self-serve (unverified).
3. **RedStone has gaps:**
   - Coverage: no NFLX, SPY, QQQ, GLD, IAU or SPCX.
   - History reaches only ~24 h back.
   - Quorum can drop to 3 at 09:30:00 (D-052).
   - Licence: BUSL-1.1 contracts ("non-production use"); gateway terms unverified.
4. **No push equity feed on Tempo from anyone.** Robinhood's 34 feeds are not relayable over CCIP (no lane).
5. **Tempo refuses value transfers.** Any oracle or bridge contract that charges `msg.value` fails; check
   every dependency.
6. **Alpha Vantage over MPP:**
   - The response is unsigned.
   - Its freshness is unverified.
   - Alpha Vantage's direct terms are personal and non-commercial.

## Open questions

1. Pyth: will it upgrade Tempo Core to the router data source and set the Lazer `verification_fee` to 0?
   Would it issue a hackathon key? (`data@dourolabs.xyz`)
2. Chainlink: bundle price for our 9–14 RegularHours streams, plus Extended/Overnight; testnet credential
   route; retention of `/api/v1/reports?timestamp=`; whether RegularHours streams keep emitting reports with
   `marketStatus 5` when closed.
3. RedStone:
   - Licence for mainnet use: BUSL grant, public gateway terms.
   - Will it add SPY, QQQ or NFLX?
   - What `---PRE_AFTER` / `---EXTENDED` / `---24_7` and `.Y` / `.T` mean.
   - Would a paid RedStone Live key extend history beyond ~24 h?
4. Alpha Vantage via MPP: realtime, delayed or historical (one $0.008 test call with `entitlement`); Locus's
   redistribution terms.
5. Robinhood Stock Token addresses on Robinhood Chain and testnet, and `uiMultiplier` reads (research-bridge).
   The Robinhood testnet faucet has NFLX, but there is no NFLX Chainlink feed on Robinhood.
6. Agari's registry still lists `SPACEX` as pre-IPO. Should the Tempo port list it as `SPCX`, and the
   PreStocks SpaceX token as a 24/7 token lane, or drop it?
7. Whether Chronicle would deploy equity oracles on Tempo, as it does on Base.

## Probe log (UTC, 2026-09-21)

| Time | Command | Result |
|---|---|---|
| 12:21 | `cast code 0xcE73…36E7` mainnet / Moderato | 7,009 B / `0x` |
| 12:22 | `cast call 0xcE73… typeAndVersion()`, `s_feeManager()`, `s_accessController()` | "VerifierProxy 2.0.0", 0x0, 0x0 |
| 12:23 | `deployblock.sh` + `cast logs` (proxy) | block 3,391,413; `VerifierSet(0, 0x00094bae…, 0xb86d…)` |
| 12:24 | `curl feeds-tempo-mainnet.json` + `latestRoundData` ×10 | §1.1 |
| 12:25 | `curl feeds-robinhood-mainnet.json` + `latestRoundData` ×34 (RH RPC) | §1.4 |
| 12:26 | Moderato proxy `0x72790f9e…` probes + logs | verifier `0xea37…`, digest `0x00090d9e…` |
| 12:22–12:29 | `scanlogs.py` verifier logs (mainnet 372 ranges, Moderato 324 ranges); RH `cast logs` | 1 / 0 / 2,116 `ReportVerified` |
| 12:28 | `curl …/data-packages/latest/redstone-primary-prod` | 963 feeds (§2.4) |
| 12:29 | `curl …/historical/redstone-primary-prod/<now−{3600,43200,86400,90000,100000}s>` | 5 TSLA pkgs up to 86,400 s; 513 empty at ≥ 90,000 s |
| 12:30 | Cboe `delayed_quotes/quotes/{TSLA,NVDA,AAPL,SPY,QQQ,GLD}.json` | closes 364.27 / 222.27 / 336.13 / 761.69 / 721.45 / 401.17 |
| 12:31 | Chronicle docs + `chroniclelabs.org/api/pairs` (browser) | §3 |
| 12:33 | `cast call` Pyth Core/Lazer on both networks; `priceFeedExists` ×9 | §4 |
| 12:34 | `cast call --value 1` to an EOA on Tempo | `Revm error: value transfer not allowed` |
| 12:36 | `cast call 0xcE73… verify(SPY report)` Tempo / Robinhood / Moderato | verifies / verifies / `VerifierNotFound` |
| 12:38 | `cast estimate` same | 93,403 gas; `cast gas-price` 6×10⁸ |
| 12:40 | `curl mpp.dev/api/services`; unpaid `POST …/global-quote` | 142 services; 402 challenge (§6) |
| 12:44 | `pyth_sim.sh` (Tempo), `pyth_base.sh` (Base) | `InvalidWormholeVaa` / TSLA 364.38 at T |
| 12:46 | Pyth Lazer `cast storage` slots 0–1; `isValidSigner` | signer `0x26fb…85b9` valid to 2034 |
| 12:48 | ecrecover control + RedStone TSLA ×5 via Tempo precompile | all 5 signers recovered |
| 12:50 | Yahoo v8 chart SPCX; Cboe SPCX | Nasdaq listing since 2026-06-12, close 152.71 |

## Sources

- **Tempo:** `reference/tempo-docs-md/` (repo `2e07f2b`): `docs__ecosystem__data-analytics.md:23-45,80-84`,
  `docs__guide__machine-payments__use-cases__financial-data.md:17-35`, `docs__guide__bridge-layerzero.md:540`,
  `docs__quickstart__evm-compatibility.md:68`, `docs__protocol__fees__spec-fee.md:17,23,178-179`.
- **Chainlink:** `github.com/smartcontractkit/documentation@b14cf1fbd45f88a4617cc7c8dbf668121e56649c`:
  `src/features/data/chains.ts`, `src/features/feeds/data/StreamsNetworksData.ts`,
  `src/content/data-feeds/tokenized-equity-feeds/{robinhood,providers}.mdx`,
  `src/content/data-streams/{sign-up,billing,market-hours,how-report-timestamps-work}.mdx`,
  `src/content/data-streams/reference/data-streams-api/interface-api.mdx`,
  `src/config/data/ccip/v1_2_0/mainnet/lanes.json`; `https://reference-data-directory.vercel.app/feeds-{tempo-mainnet,robinhood-mainnet,ethereum-mainnet-arbitrum-1}.json`.
- **RedStone:** `github.com/redstone-finance/redstone-oracles-monorepo@1a70ec4067ee6c07bac4bf9db557277a417ef6ba`:
  `LICENSE`, `packages/evm-connector/{package.json,contracts/data-services/PrimaryProdDataServiceConsumerBase.sol,contracts/core/RedstoneDefaultsLib.sol,contracts/core/RedstoneConsumerBase.sol}`,
  `packages/relayer-remote-config/main/relayer-manifests-multi-feed/tempo{,Testnet}MultiFeed.json`;
  `https://oracle-gateway-2.a.redstone.finance/data-packages/{latest,historical}/redstone-primary-prod`.
- **Chronicle:** `github.com/chronicleprotocol/documentation@8368818b`:
  `docs/Developers/{testnet.md,Guides/readingFromOracles.md,Guides/whitelistAddress.md}`,
  `docs/Resources/FAQ/General.md`; `https://chroniclelabs.org/api/pairs`; Chronicle Tempo blog (URL in §3).
- **Pyth:** `github.com/pyth-network/pyth-crosschain@f06628c4212579ae2f2d7f0585caee61ee8df758`:
  `contract_manager/src/store/{chains/EvmChains.json,contracts/EvmPriceFeedContracts.json,contracts/EvmLazerContracts.json,contracts/EvmWormholeContracts.json,contracts/EvmExecutorContracts.json}`,
  `lazer/contracts/evm/src/PythLazer.sol`; `docs.pyth.network/price-feeds/core/upgrade/{contracts,preparing}.md`,
  `docs.pyth.network/price-feeds/core/contract-addresses/evm.md`.
- **MPP / Alpha Vantage:** `https://mpp.dev/api/services`, `https://paywithlocus.com/mpp/alphavantage.md`,
  `https://alphavantage.mpp.paywithlocus.com/openapi.json`, `https://www.alphavantage.co/documentation/`,
  `https://www.alphavantage.co/terms_of_service/`.
- **Robinhood Chain:** `https://docs.robinhood.com/chain/oracles-and-price-feeds/`; `chainid.network/chains.json` (4663 / 46630 RPCs).
- **Agari** (`/Users/abu/dev/hackathon/agari-wt/w1@254f538`): `context/02-equity-price-oracles-and-market-hours.md`,
  `context/13-affordable-equity-price-sources.md`, `docs/plan/decisions.md` (D-003, D-007, D-052…D-057, D-100…D-103),
  `docs/plan/specs/prints.md`, `services/ops/config/price-sources.json`, `packages/core/src/market/tickers.ts`;
  archived Pyth blob `/Users/abu/dev/hackathon/stocklana/data/archive/pyth/2026-09-18.jsonl`.
- **Market reference:** `cdn.cboe.com/api/global/delayed_quotes/quotes/<T>.json`, `query1.finance.yahoo.com/v8/finance/chart/SPCX`.
