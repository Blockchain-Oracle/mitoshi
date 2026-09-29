# Bridging Robinhood Stock Tokens to Tempo — research (v1, 2026-09-21)

Inputs for Layer 1 of `11-stock-strategies-architecture.md` (Option A: lock on the source chain, mint a
1:1 mirror on Tempo, burn to unlock). Every claim is marked **[C]** (confirmed this pass: on-chain call,
verified source, or primary doc read today) or **[I]** (inference). Commands are reproducible with
`cast` (Foundry) against the public RPCs listed in §1. Blockscout's mainnet API sits behind a Cloudflare
challenge; it was read with `firecrawl scrape <url> --format rawHtml`.

## Summary

Robinhood Chain (mainnet 4663, public launch 2026-07-01) has **195 live Stock Tokens and ETF tokens**
on mainnet, including **GLD, SLV, USO, SPY, QQQ, VTI, SMH, SOXX and XLK**, so every planned theme can be
built, gold included. The testnet faucet mints exactly **five**: TSLA, AMZN, PLTR, NFLX and AMD. The tokens
are beacon-proxy ERC-20s (18 decimals) with **no allowlist**. Any EOA or contract can hold them. The
issuer does keep a **blocklist**, a **global and per-token pause**, and a **`burn`/`adminBurn` that
can burn from any address**, and it can **upgrade the beacon**. A lockbox is therefore possible, but its
backing is subject to issuer powers. **LayerZero V2 is the only standard messaging path that is live
between Robinhood Chain and Tempo on mainnet.** The pathway is supported at the endpoint, but its default
DVN is LayerZero's *dead* DVN, so the OApp must set its own DVNs. Five of them price the pathway both
ways, and the executor quotes it. There is **no direct LayerZero pathway on testnet** (40451↔40444: no
default library, DVN or executor), and **no CCIP lane exists in any direction on mainnet or testnet**. A
testnet route is still possible on standard LayerZero infrastructure: an **OFT mesh hopping through Base
Sepolia**, where every leg is supported with the LayerZero Labs DVN by default. The best model for the
Tempo side is live code. **USDC.e, USDT0, frxUSD and USDY are TIP-20s minted by a LayerZero adapter that
holds `ISSUER_ROLE`**, and **cbBTC is a TIP-20 minted by a CCIP BurnMintTokenPool**. Frax's open-source
`FraxOFTMintableAdapterUpgradeableTIP20` is deployed on both Tempo mainnet and Moderato. ERC-8056 cannot
live inside a TIP-20, so the multiplier has to be mirrored into a companion contract through an OApp
message. Robinhood schedules dividend multiplier changes about 10 minutes ahead, which gives a mirror
message time to land first.

## Findings

| # | Finding | Source | |
|---|---|---|---|
| F1 | Robinhood Chain mainnet chain ID **4663**, testnet **46630**; public RPC `rpc.mainnet.chain.robinhood.com` / `rpc.testnet.chain.robinhood.com` (rate-limited) | docs.robinhood.com/chain/connecting; `cast chain-id` → 4663 / 46630 | [C] |
| F2 | Public mainnet launch **2026-07-01**; chain genesis earlier (block 7796 = 2026-05-21) | coindesk.com/business/2026/07/01/robinhood-rolls-out-public-blockchain…; `cast block 7796 --field timestamp` | [C] |
| F3 | **195** mainnet Stock Tokens/ETFs, all `ASSET_STATUS_ACTIVE`, all on chain 4663 only; docs registry = assets API (0 mismatches) | docs.robinhood.com/chain/contracts (JS-rendered, firecrawl `--wait-for 12000`); `GET api.robinhood.com/rhj/assets` | [C] |
| F4 | **GLD** `0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e` (21,040 supply), SLV, USO, SPY, QQQ, VTI, SMH, SOXX, XLK, SCHD, SPMO, SGOV, SHY, BND, EWT, EWY, INDA exist | same | [C] |
| F5 | Faucet contract `0x8762F937…17Be` mints exactly 5 tokens: TSLA `0xC9f9…Bd4E`, AMZN `0x5884…9E02`, PLTR `0x1FBE…98d0`, NFLX `0x3b82…8C93`, AMD `0x7117…778d` (5e18 each via `sendTokensAndEther`) | receipt of tx `0x7383f525…8db5` on 46630 | [C] |
| F6 | Tokens are **beacon proxies**; beacon **is** the `AccessControlsRegistry` (mainnet `0xe10b6f6b…1b00`, testnet `0x1dF3cA0f…6Ca5`); impl `Stock` (mainnet `0xb35490d6…5aE2`) | `cast storage <token> 0xa3f0ad74…3d50`; Blockscout-verified source | [C] |
| F7 | **No allowlist/KYC gate** on transfer; checks are `onlyNotPaused` + `onlyNotBlocked(from,to,msg.sender)`; issuer can `burn(from,…)` (BURNER_ROLE) and `adminBurn(from,…)` (ADMIN_BURNER_ROLE) from **any** address | `src/Stock.sol:57-126` (verified) | [C] |
| F8 | 246 addresses blocked on the mainnet registry (first at block 43543, 2026-06-08); one global pause 2026-06-30 (pre-launch, ~70 s) | `eth_getLogs` `Blocked(address)`/`Paused()` on `0xe10b…1b00` | [C] |
| F9 | Contracts hold Stock Tokens on mainnet: top NVDA holders are Uniswap v4 **PoolManager** `0x8366…0951`, Uniswap v3 pools, Safes, and a **ZkLighter** proxy `0x94bA…fF9d` (a bridge/lockbox-style holder) | Blockscout `/api/v2/tokens/<NVDA>/holders` | [C] |
| F10 | ERC-8056 is **Draft** (Superstate, Robinhood, Coinbase authors); Robinhood implements `IScaledUIAmount` (0xa60bf13d), `…NewUIMultiplier` (0x4bd27648), `…Balances` (0xd890fd71); **not** `…Conversion` (0x57854fc3); event named `TransferWithScaledUI` vs spec `TransferWithUIAmount` | ethereum/ERCs@554d3467:ERCS/erc-8056.md; `cast call <TSLA> supportsInterface(bytes4)` | [C] |
| F11 | 32 of 195 tokens have multiplier ≠ 1 (e.g. **CRWD 4.0** = 4-for-1 split effective 2026-07-02; SPY 1.00171799); updates are **scheduled ~584–588 s ahead** for dividends, ~12.5 h ahead for the CRWD split | `uiMultiplier()` batch; `UIMultiplierUpdated` logs | [C] |
| F12 | Testnet `Stock` impl lags mainnet: no `OraclePausable`, no `terms()`, `approve` doesn't check spender blocklist | diff of verified sources (testnet impl `0xBd14156E…57DA`) | [C] |
| F13 | Stock Tokens: debt securities of **Robinhood Assets (Jersey)**; not for US persons; restricted incl. **Canada, UK, Switzerland**; prohibited: Cuba, Belarus, Iran, N. Korea, Russia, Syria, Ukraine, South Sudan, Sudan, Myanmar, Venezuela. **Securities ledger = Robinhood Chain.** Docs: "can be transferred and held in any wallet" | docs.robinhood.com/chain/stock-tokens; /rhj/restricted-jurisdictions; /rhj/product; /chain/building-with-stock-tokens | [C] |
| F14 | Robinhood Chain ToS: no "Robinhood Chain" marks in **token name or token metadata**; must not call Stock Tokens "tokenized stocks/equities"; Robinhood may block wallet addresses; sequencer screens sanctioned addresses | docs.robinhood.com/chain/terms-of-service §5.7(d),(h),(j), §"suspend…"; /chain/differences-from-ethereum#transaction-screening | [C] |
| F15 | LayerZero V2: RH mainnet **EID 30416** EndpointV2 `0x6f47…dd5b`; RH testnet **40451** `0x3aca…fe32`; Tempo **30410** `0x20bb…cc9c`; Moderato **40444** `0xfb34…fc41` (old `tempo-testnet` 40431 is DEPRECATED) | metadata.layerzero-api.com/v1/metadata/deployments | [C] |
| F16 | **Mainnet pathway RH↔Tempo is supported** (`isSupportedEid` true both ways) but default ULN config = **LZDeadDVN** only → OApp must set DVNs | `cast call <endpoint> isSupportedEid(uint32)`; `SendUln302.getUlnConfig(0x0,eid)` | [C] |
| F17 | DVNs on both mainnets: LayerZero Labs, Nethermind, Horizen, Canary, P2P, Luganodes, Nansen, StablecoinX, Frax — LZ Labs/Nethermind/Horizen/Canary/P2P all **price** 30416↔30410 | metadata dvns ∩; `DVN.getFee(dstEid,…)` returns fee (reverts `DVN_EidNotSupported` for unsupported) | [C] |
| F18 | **Testnet pathway 40451↔40444 unsupported**: endpoints `isSupportedEid`=false, ULN libs false, both executors revert, Moderato DVN reverts; LZ `setSendLibrary` requires the lib to support the EID, so an OApp **cannot** open it itself | on-chain calls; LayerZero-v2@9c741e7f `MessageLibManager.sol:64,227-231`, `UlnBase.sol:135-138` | [C] |
| F19 | Testnet **hop works**: RH testnet↔Base Sepolia (40245)↔Moderato all supported; default DVN = LayerZero Labs (not dead); executors + DVNs quote every leg | `isSupportedEid`, `getUlnConfig`, `getFee` on all three chains | [C] |
| F20 | Tempo endpoint is **EndpointV2Alt**: `nativeToken()` = **LZEndpointDollar** (`0x0ceb…4cbb` mainnet, `0x0e81…0803` Moderato); fees paid by wrapping whitelisted TIP-20s (mainnet: pathUSD, USDC.e, USDT0) into LZD; default `OAppSender._payNative` (requires `msg.value`) must be overridden | `cast call`; Tempo docs bridge-layerzero.md:540-547; OAppSender.sol:104-107 | [C] |
| F21 | **Precedent: bridged assets on Tempo are TIP-20s whose bridge contract holds `ISSUER_ROLE`** — USDC.e (Stargate OFT `0x8c76…4392`), USDT0 (OFT proxy `0xaf37…47ff`), frxUSD (Frax TIP-20 adapter `0x0000…f1e5`, v1.1.0), USDY (Ondo LZ OApp `0xd45c…5bcb`), cbBTC (CCIP `BurnMintTokenPool 1.6.1` `0x3b54…c71e`) | `hasRole(address,bytes32)` on each; mint tx receipts | [C] |
| F22 | Frax's **open-source** TIP-20 adapter: `_debit` = `transferFrom(user→adapter)` + `burn(amount)`; `_credit` = `mint(to, amount)`; `_payNative` wraps into LZD; live on Tempo mainnet and on Moderato (`0x16fb…5a27`, peered to Sepolia) | FraxFinance/frax-oft-upgradeable@981a7b96:contracts/FraxOFTMintableAdapterUpgradeableTIP20.sol:78-119 | [C] |
| F23 | **CCIP**: routers/selectors on all four networks; **no lane** RH↔Tempo on mainnet or testnet (`isChainSupported` false, `getOnRamp` = 0x0, both directions) | docs.chain.link/ccip/directory/*; router calls | [C] |
| F24 | TIP-20 lacks `owner()`, `getCCIPAdmin()` and OZ-order `hasRole(bytes32,address)` → CCIP's self-serve `RegistryModuleOwnerCustom 1.6.0` paths cannot register a TIP-20 | calls revert with `0xaa4bc69a…` | [C] calls / [I] consequence |
| F25 | **Wormhole** core is on all four networks (Tempo = WH chain 68, Robinhood = 72); guardians have signed VAAs from both **mainnets** and from Moderato; **0 VAAs** indexed for RH testnet; Executor supports 68 & 72 on mainnet, only 68 on testnet | wormhole@2df4000c `node/pkg/watchers/evm/chain_config.go:105,107,155,161`; wormholescan API; executor `/v0/capabilities` | [C] |
| F26 | **Hyperlane** mailbox `0x3a86…2aa7` on RH and Tempo **mainnet**; Tempo mailbox `nonce()`=0; RH default ISM has "No ISM found for origin: 4217"; RH IGP quotes 171.9 ETH for 200k gas to Tempo (misconfigured); no testnet entries | hyperlane-registry@a599287f; on-chain calls | [C] |
| F27 | Mainnet LZ cost per message (500k dst gas): **RH→Tempo ≈ 9.17e13 wei ≈ $0.25**; **Tempo→RH ≈ 0.352 + 2×0.018 LZD ≈ $0.39** (ETH $2,725.71) | `Executor.getFee`, `DVN.getFee`; CoinGecko 2026-09-21 | [C] inputs / [I] total (treasury fee not included) |

## 1. Robinhood Chain networks

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | **4663** [C] | **46630** [C] |
| Stack | Arbitrum Nitro L2 on Ethereum, blobs for DA, ETH gas [C docs] | same |
| Public RPC (rate-limited, "not for production") | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| Provider RPC | `https://robinhood-mainnet.g.alchemy.com/v2/{KEY}` (also Chainstack, QuickNode, Blockdaemon, dRPC, Validation Cloud) | `https://robinhood-testnet.g.alchemy.com/v2/{KEY}` |
| Sequencer / feed | `https://sequencer.mainnet.chain.robinhood.com` / `wss://feed.mainnet.chain.robinhood.com` | `…testnet…` |
| Explorer | `robinhoodchain.blockscout.com` (API behind Cloudflare) | `explorer.testnet.chain.robinhood.com` (API open; corpus: homepage showed stale placeholder data) |
| Status | `status.robinhoodchain.offchain.io` | same |
| Launch | Public mainnet **2026-07-01** (CoinDesk 2026-07-01; Agari `context/01` line 44) — block 7796 already at 2026-05-21 [C] | live (faucet mints now) [C] |
| Block time | ~100 ms (LZ/Hyperlane metadata `estimateBlockTime: 0.1`) [I] | — |

Source: docs.robinhood.com/chain/connecting (firecrawl, 2026-09-21). `cast chain-id --rpc-url <rpc>` → 4663 / 46630;
`cast block-number` → 68,793,164 / 122,384,991 at 12:22 UTC.

## 2. Stock Token list

### 2.1 Mainnet — 195 tokens, grouped by theme

The registry at docs.robinhood.com/chain/contracts is "generated live from the on-chain asset registry"
and only renders client-side. It was captured with `firecrawl scrape … --wait-for 12000`. The same 195
entries, with matching addresses, come from `GET https://api.robinhood.com/rhj/assets`, which also
carries `isin`, `currentMultiplier`, `pendingMultiplier`, `tradingCapabilities` and `logoUrl` [C].
All 195 are `ASSET_STATUS_ACTIVE` and tradable in market, extended and overnight sessions [C].
**Theme grouping is our own classification [I].** Supply = on-chain `totalSupply()/1e18`, read
2026-09-21 [C]. It is circulating tokens, not float. Full address table: **Appendix A**.

| Theme | Tickers (supply on Robinhood Chain, tokens, 2026-09-21) |
|---|---|
| ETF — broad market / factor / dividend | SPY (31,651), QQQ (7,118), VTI (152), SPMO (119), SCHD (582) |
| ETF — sector (tech, semis) | XLK (86), SMH (204), SOXX (252) |
| ETF — commodities (gold, silver, oil) | GLD (21,040), SLV (22,090), USO (18,168) |
| ETF — bonds / T-bills | SGOV (37,904), SHY (195), BND (0.00) |
| ETF — country (Taiwan, Korea, India) | EWT (158), EWY (1,049), INDA (3,677) |
| Semiconductors & chip equipment | NVDA (91,825), AMD (3,149), AVGO (567), TSM (3,553), INTC (17,197), QCOM (141), MU (4,523), MRVL (1,507), ASML (124), AMAT (254), LRCX (48), KLAC (61), TER (67), ONTO (39), AMKR (248), ON (1,083), MPWR (14), NVTS (842), TSEM (94), UMC (847), SKHY (4,621), SNDK (940), WDC (194), SIMO (89), MXL (248), MTSI (58), AMBA (269), AEHR (105), AXTI (218), VICR (63), ALAB (58), CRDO (176) |
| AI infrastructure — servers, networking, optics, power & cooling | SMCI (756), DELL (648), HPE (750), ANET (94), CSCO (226), CIEN (30), CLS (41), JBL (31), VRT (79), MOD (80), GLW (78), COHR (57), LITE (247), AAOI (295), POET (3,020), PENG (2,508), CBRS (608), AEIS (56) |
| AI cloud / neoclouds / miners-turned-AI hosts | CRWV (6,170), NBIS (1,333), ORCL (6,198), APLD (598), IREN (590), WULF (1,405), CLSK (814), WYFI (8,078), DOCN (151) |
| Software & AI applications | MSFT (6,027), PLTR (13,882), CRM (373), NOW (229), ADBE (228), INTU (72), WDAY (289), SNOW (565), MDB (43), DDOG (813), TEAM (96), PATH (1,347), SOUN (10,976), APP (97), TTD (1,028), SHOP (1,876), FIG (13,460), ZM (776), IBM (2,388), CTSH (238), FICO (17), INOD (301), TEM (192), NAVN (394) |
| Cybersecurity | CRWD (20), PANW (50), FTNT (71), ZS (73), NET (566), BB (64,791) |
| Mega-cap internet & media | AAPL (16,234), AMZN (13,636), GOOGL (15,775), META (7,603), NFLX (11,775), RBLX (17,572), RDDT (16,005), SNAP (157,992), TTWO (6,401), BABA (5,173), DJT (233,383) |
| Quantum computing | IONQ (604), RGTI (1,078), QBTS (1,254), QUBT (23,608), QNT (0.00), INFQ (2,371), XNDU (1,340) |
| Space, aerospace, defense & autonomy | OUST (360), SPCX (71,640), RKLB (1,532), ASTS (868), LUNR (1,179), RDW (1,767), PL (1,166), FLY (1,332), SATS (0.10), VSAT (178), BA (1,360), GE (220), HWM (74), LMT (617), LHX (60), HII (53), KTOS (337), AVAV (116), RCAT (32,823), AXON (26), JOBY (3,231), AUR (2,849) |
| Energy, power, nuclear & grid | CEG (249), VST (147), GEV (15), OKLO (391), SMR (2,819), NNE (16,016), BE (3,259), FLNC (1,450), RUN (5,703), TE (6,806), PWR (19), POWL (101), FIX (20), XOM (215), PR (573), USAR (41,476) |
| Crypto / digital-asset equities & fintech | COIN (10,744), MSTR (19,683), CRCL (41,590), GLXY (11,731), BULL (37,875), FUTU (333), SOFI (2,709), NU (18,284), FISV (368) |
| Healthcare & biotech | LLY (1,793), JNJ (1,025), PFE (12,755), MRNA (4,119), UNH (97), HIMS (131,207), CLOV (3,589), ABCL (1,036), IBRX (2,001), SLS (1,231) |
| Consumer, autos, retail & travel | TSLA (13,552), RIVN (32,717), F (17,779), CVNA (1,676), COST (1,499), LULU (6,837), ELF (423), CELH (796), KSS (1,325), GME (148,604), AMC (1,205,169), CCL (2,234), UPS (2,578), P (293) |

Theme coverage for the owner's list: **AI stocks** (NVDA, AMD, AVGO, TSM, MSFT, PLTR, META, GOOGL…),
**gold** (GLD, plus SLV), **energy** (CEG, VST, GEV, OKLO, SMR, XOM, USO…), **finance / digital** (COIN,
MSTR, CRCL, GLXY, SOFI, NU, FISV), **AI full stack** (chips → servers/optics → neoclouds → software),
**quantum**, **space/defense**, and **index/bond sleeves** (SPY, QQQ, VTI, SGOV, SHY) for cash-like
allocations. There is **no IAU/GLDM**, only GLD [C, absent from the registry]. BND and QNT supply is ~0; SATS is 0.10 [C].

### 2.2 Testnet (46630) — faucet tokens

| Symbol | Address | `name()` | Supply (growing) |
|---|---|---|---|
| TSLA | `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` | Tesla | 6,178,370 |
| AMZN | `0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02` | Amazon | ~6.18M |
| PLTR | `0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0` | Palantir Technologies | ~6.18M |
| NFLX | `0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93` | Netflix | ~6.18M |
| AMD | `0x71178BAc73cBeb415514eB542a8995b82669778d` | AMD | ~6.18M |

- These are the **only** tokens the faucet (`0x8762F93772c663c6a88Ba50900bd5381df2717Be`) mints. Tx
  `0x7383f52519dc45b58d81d2de296cb00a371c11b7caa647d58c97752b71b38db5` (`sendTokensAndEther`) emits
  Transfer logs from exactly these five addresses [C]. All five share the testnet registry/beacon
  `0x1dF3cA0fD30ED5eeb09eB01938f4E9c5196E6Ca5`, 18 decimals, `uiMultiplier` = 1e18 [C].
- **The testnet is full of look-alikes.** An explorer search for "TSLA" returns 30+ tokens: "TSLA Test
  Stock", "Tesla Robinhood Token", "Mock TSLA", and more. Only the five above come from the faucet [C].
  Hard-code addresses and never resolve by symbol.
- Testnet has **no GLD or ETFs**. The explorer returned 158 tokens named NVDA, GLD, SPY, AAPL, QQQ or
  MSFT, and none uses Robinhood's testnet beacon `0x1dF3…6Ca5` (EIP-1967 beacon slot read on each) [C].
  Testnet themes are limited to the five faucet tickers. Other symbols were not checked exhaustively.
- The docs registry lists mainnet only; no testnet registry page was found [C].

## 3. Token contract

### 3.1 Architecture (verified source, compiler 0.8.33, verified 2026-06-15)

| Piece | Mainnet | Testnet | Notes |
|---|---|---|---|
| Token (per ticker) | beacon proxy, 569-byte code | same | EIP-1967 beacon slot `0xa3f0…3d50` → registry [C] |
| Beacon **and** access registry | `AccessControlsRegistry` `0xe10b6f6B275de231345c20D14Ab812db62151b00` | `0x1dF3cA0fD30ED5eeb09eB01938f4E9c5196E6Ca5` | `implementation()`, `upgradeTo` (BEACON_UPGRADER_ROLE), `pause` (PAUSER_ROLE), `blockAccounts` (BLOCKER_ROLE), `isBlocked` — `AccessControlsRegistry.sol:26-56` [C] |
| Implementation | `Stock` `0xb35490d6f9163DE4F80d88dc75c3516eb64C5aE2` | `Stock` `0xBd14156E05c6AF28ad39aA53a2AB8eB9CDf657DA` | OZ `ERC20PermitUpgradeable` + ERC-8056 + `OraclePausable` (mainnet only) [C] |
| Decimals | 18 | 18 | [C] |
| `terms()` | `https://robinhood.com/stocktoken/rhj` | absent | `Stock.sol:133-135` [C] |

### 3.2 Transfer restrictions (what a lockbox faces)

| Control | Where | Effect on a lockbox / receivers | |
|---|---|---|---|
| Allowlist / KYC | **none** | Any EOA or contract can hold and receive, on both networks | [C] source + F9 holders |
| Blocklist | `onlyNotBlocked(from)`, `(to)`, `(msg.sender)` on `transfer`/`transferFrom`/`approve`/`permit`/`mint`/`burn` — `Stock.sol:57-122`, `AccessControlled.sol:35-40` | If Robinhood blocks the lockbox, locked funds freeze; a blocked recipient makes an unlock revert | [C] |
| Pause | `paused()` = token flag **OR** registry-wide flag — `Stock.sol:137-140` | Unlocks and locks revert while paused; LayerZero keeps the message retryable | [C] source / [I] LZ behaviour |
| Issuer burn | `burn(from, amt)` (BURNER_ROLE, no allowance) and `adminBurn(from, amt)` (ADMIN_BURNER_ROLE, **ignores pause and blocklist**) — `Stock.sol:113-126` | Issuer can reduce the lockbox balance → mirror under-backed. Reserve view must be live | [C] |
| Upgrade | Beacon `upgradeTo` — two `Upgraded` events so far (blocks 7796, 657134, both to `0xb354…`) | Behaviour of all 195 tokens can change at once | [C] |
| Metadata | `setMetadata(name, symbol)` (METADATA_UPDATER_ROLE) — `Stock.sol:179-183` | A ticker rename on RH cannot be mirrored (TIP-20 name/symbol immutable) | [C] |
| Sequencer screening | Transactions touching sanctioned addresses are excluded by the sequencer | Additional to the on-chain blocklist | [C] docs |

### 3.3 ERC-8056 (Scaled UI Amount)

- **Spec**: ethereum/ERCs@554d3467b29742aae0f864cdd2fdb492510a91ba:ERCS/erc-8056.md. Draft, created
  2025-10-20. Authors from Superstate, Robinhood (Gilbert Shih) and Coinbase. Discussion:
  ethereum-magicians.org/t/erc-8056-scaled-ui-amount-extension-for-erc-20-tokens/25899 [C].
  - Required: `uiMultiplier()` (18-dec fixed point), event `UIMultiplierUpdated(old, new,
    effectiveAtTimestamp)`, `IScaledUIAmountNewUIMultiplier` (`newUIMultiplier()`, `effectiveAt()`),
    and ERC-165 (lines 33-46, 79-105).
  - Optional: `TransferWithUIAmount`, `UIMultiplierUpdateCancelled`, Conversion, Balances.
  - Interface IDs: 0xa60bf13d / 0x4bd27648 / 0x57854fc3 / 0xd890fd71 [C].
- **Robinhood's implementation** (`ERC20ScaledUIUpgradeable.sol`) [C]:
  - Storage holds `_multiplier`, `_newMultiplier`, `_effectiveAt` (lines 19-23).
  - `uiMultiplier()` returns `_newMultiplier` once `block.timestamp >= _effectiveAt`, otherwise the
    stored current value (58-73).
  - `updateMultiplier(new)` takes effect immediately; `updateMultiplier(new, effectiveAt)` schedules
    it (`Stock.sol:159-169`).
  - A new schedule **silently supersedes** a pending one. There is no cancel event (40-56).
  - Emits `TransferWithScaledUI(from,to,value,uiValue)` on every `_update` (97-100). The name differs
    from the spec's `TransferWithUIAmount`.
  - `balanceOfUI` and `totalSupplyUI` exist (89-95). There are no `toUIAmount`/`fromUIAmount`, so
    `supportsInterface(0x57854fc3)` = false.
- Conversion (docs): `underlying shares = raw × uiMultiplier / 1e18`. The Chainlink feed price is per
  token and **already includes** the multiplier. `oraclePaused()` is advisory: price feeds pause during
  corporate actions (docs.robinhood.com/chain/oracles-and-price-feeds) [C].
- **Live data** [C]:
  - 32 tokens carry a multiplier ≠ 1. The largest are CRWD 4.00000000 (split) and CCL 1.0215.
  - No pending updates at read time.
  - Update scheduling from `UIMultiplierUpdated` logs:
    - NVDA: sent 2026-09-09 23:50 UTC, effective **588 s** later.
    - SPY: 584 s later.
    - CRWD split: first scheduled 44,918 s ahead, then **re-sent** with the same value 4,456 s ahead.
      A mirror must be idempotent.

### 3.4 What a Tempo mirror must replicate

| Source behaviour | Mirror on Tempo | |
|---|---|---|
| 18 decimals | TIP-20 is fixed at **6** (`migrate-erc20-to-tip20.md:107`). The OFT's default `sharedDecimals()=6` (`OFTCore.sol:83-84`) maps 18→6 exactly; dust below 1e-6 share stays with the sender | [C] |
| `uiMultiplier` / `newUIMultiplier` / `effectiveAt` | **Companion view contract** holding (current, pending, effectiveAt) per mirror, fed by messages. TIP-20 is a precompile: "Do not port custom ERC-20 methods into the token" (`migrate-erc20-to-tip20.md:205`) | [C] constraint |
| `balanceOfUI` / `totalSupplyUI`, ERC-165 IDs | Companion reads `TIP20.balanceOf` and exposes the three IDs Robinhood supports | [I] |
| `TransferWithScaledUI` per transfer | **Cannot be replicated**: TIP-20 emits its own events only. Indexers compute `uiValue` offchain | [I] |
| `UIMultiplierUpdated` | Companion emits the same event on each applied update | [I] |
| `paused()` (token ∨ registry), `oraclePaused()` | Mirror flags on the companion. Optionally pause the TIP-20 via `PAUSE_ROLE` (owner decision) | [I] |
| Blocklist | Not mirrored by default. A TIP-403 blacklist policy is available if wanted | [I] |
| Name/symbol | Must **not** contain Robinhood marks (ToS §5.7(d),(h)). Immutable, so a source rename leaves a stale symbol | [C] ToS / [I] |
| `currency` | Own ticker, e.g. `"TSLA"`: an accumulating, non-USD asset (`migrate-erc20-to-tip20.md:118-126`, `tip20__overview.md:88`) | [C] rule |

## 4. Eligibility and legal constraints (stated plainly)

- **What the product is**: tokenised **debt securities** issued by Robinhood Assets (Jersey) Ltd
  ("RHJ"). They give economic exposure, not rights in the underlying. RHJ is unregulated, holds Jersey
  consents, and has a Base Prospectus approved by the FMA Liechtenstein under the EU Prospectus
  Regulation (docs.robinhood.com/rhj, /rhj/product) [C]. Its EEA availability via passporting is
  [I]. News reports "more than 120 countries" via Robinhood Wallet (Robinhood newsroom, July 2026) [C].
- **Who may hold them**: not US persons (Reg S); offers restricted in **Canada, UK and Switzerland**;
  prohibited in Cuba, Belarus, Iran, North Korea, Russia, Syria, Ukraine, South Sudan, Sudan, Myanmar
  and Venezuela (docs.robinhood.com/rhj/restricted-jurisdictions) [C]. The issuer site is gated to
  Professional Clients/Qualified Investors or buyers via a licensed institution [C].
- **Self-custody**: Robinhood states Stock Tokens "remain standard ERC-20s and can be transferred and
  held in any wallet" (building-with-stock-tokens). On-chain there is no allowlist (§3.2) [C].
- **The bridge is not recognised**. The product page says "Securities ledger: Transaction records for
  each Product are maintained on Robinhood Chain". Legally, the **lockbox contract is the holder**; a
  Tempo mirror is our claim on our lockbox, not an RHJ security. Redemption with RHJ requires KYC and
  tokens on Robinhood Chain, so a mirror holder must bridge back first [C] quote / [I] consequence.
- **Distribution risk**: the selling restrictions forbid offering, selling or *delivering* Stock Tokens
  to US persons. Minting mirrors to arbitrary Tempo wallets is delivering exposure outside RHJ's
  controls [I]. The owner's chosen answer is the disclaimer (prototype, unaudited, not an offer; owner
  and judges only) plus a non-US holder note.
- **ToS items that bind us** (docs.robinhood.com/chain/terms-of-service) [C]:
  - No Robinhood Chain marks in our token names or token metadata (§5.7(d),(h)).
  - Say "Stock Tokens", never "tokenized stocks/equities" (§5.7(j)).
  - Include an "not affiliated with Robinhood" disclaimer (§5.7(b)).
  - Robinhood may block wallet addresses.
  - Robinhood disclaims all liability for bridging contracts.
- **Precedent** that bridging custody is tolerated: a ZkLighter proxy holds 3,472 NVDA on mainnet
  (F9). Robinhood's docs list Lighter as a Stock Token venue [C] holding / [I] endorsement scope.

## 5. LayerZero V2

### 5.1 Deployments (metadata.layerzero-api.com/v1/metadata/deployments, 2026-09-21) [C]

| | RH mainnet | RH testnet | Tempo mainnet | Moderato |
|---|---|---|---|---|
| EID | **30416** | **40451** | **30410** | **40444** |
| EndpointV2 | `0x6f475642a6e85809b1c36fa62763669b1b48dd5b` | `0x3acaaf60502791d199a5a5f0b173d78229ebfe32` | `0x20bb7c2e2f4e5ca2b4c57060d1ae2615245dcc9c` | `0xfb34352ba2e2d9cb93837bb19d36db5d93bcfc41` |
| SendUln302 | `0xc39161c743d0307eb9bcc9fef03eeb9dc4802de7` | `0x45841dd1ca50265da7614fc43a361e526c0e6160` | `0x572863d9247e52026e0892d9cd2e519b41edb73c` | `0x91ec94dd5e949bdb2ece3b91b9602ec5f7f59ffd` |
| ReceiveUln302 | `0xe1844c5d63a9543023008d332bd3d2e6f1fe1043` | `0xd682ecf100f6f4284138aa925348633b0611ae21` | `0x0b6f08c2d39421acb49c99abce82050e356171e5` | `0xfebe4c839efa9f506c092a32fd0bb546b76a1d38` |
| Executor | `0x4208d6e27538189bb48e603d6123a94b8abe0a0b` | `0x701f3927871efcea1235db722f9e608ae120d243` | `0xf851abca1d0fd1df8eaba6de466a102996b7d7b2` | `0xe665f5dfd91dfe883d36cc8552d4cc385ac23687` |
| LZ Labs DVN | `0xd01ae6905d48315f7be10c7330aecf8360ef5b12` | `0xa78a78a13074ed93ad447a26ec57121f29e8fec2` | `0x76faff60799021b301b45dc1bbede53f261f9961` | `0x0ac2924460a5b285fd205dedb46738ad46971061` |
| Dead DVN | `0x6788f524…e842` | `0x88b27057…e6e0` | `0x3436d350…450c` | `0x236b9303…72f1` |
| Fee unit | ETH (`msg.value`) | ETH | **LZD** (6 dec) via `LZEndpointDollar` `0x0ceb237e109ee22374a567c6b09f373c73fa4cbb` | **LZD** `0x0e81579b25c9c458a2030824b7fdbd0194900803` |
| Other DVNs | Nethermind `0x0ffe…fdf8`, Horizen `0x1258…8d89`, Canary `0x8d77…82dd`, P2P `0x8ed0…4d76`, Luganodes `0x72b1…0f0b`, Nansen `0x9657…f7a0`, StablecoinX `0x7868…5855`, Frax `0xc685…4c4c`, BitGo, Paxos, Superform, ApeDVN | Paxos, Nethermind, Horizen | Nethermind `0x0d87…b1cb`, Horizen `0x97fa…97a8`, Canary `0xb30b…1b1f`, P2P `0x71b7…3ad7`, Luganodes `0x75d0…8376`, Nansen `0xbfbb…6b02`, StablecoinX `0x54c3…1734`, Frax `0xf577…37f2`, USDT0, Ondo, Deutsche Telekom, Fidelity, FurtherFP | FurtherFP only |

Tempo docs (`docs__guide__bridge-layerzero.md:53`) confirm EID 30410 and the EndpointV2/LZEndpointDollar
addresses [C]. `tempo-testnet` (EID 40431) is marked `chainStatus: DEPRECATED`; Moderato is 40444 [C].

### 5.2 Can the Robinhood↔Tempo pathway be configured?

| Direction | `isSupportedEid` | Default ULN config (conf, reqDVNs) | Executor `getFee` | DVN `getFee` | Verdict |
|---|---|---|---|---|---|
| RH mainnet → Tempo | true | (5, [**DeadDVN**]) | 9.17e13 wei | LZ Labs/Nethermind/Horizen/Canary/P2P all quote | **Usable once the OApp sets real DVNs** [C] |
| Tempo → RH mainnet | true | (5, [**DeadDVN**]) | 0.30–0.35 LZD | all five quote | **Usable once the OApp sets real DVNs** [C] |
| RH testnet → Moderato | **false** | — | reverts `0xc3baa0b7…` | LZ Labs quotes; lib unsupported | **Blocked** [C] |
| Moderato → RH testnet | **false** | — | reverts | reverts `DVN_EidNotSupported(40451)` | **Blocked** [C] |

Why the OApp cannot fix the testnet case itself:
- `EndpointV2.setSendLibrary/setReceiveLibrary` carry `onlySupportedEid(_newLib, _eid)`
  (LayerZero-Labs/LayerZero-v2@9c741e7f `…/protocol/contracts/MessageLibManager.sol:64,227-251`).
- ULN302 support needs a *default* config with at least one DVN (`…/messagelib/contracts/uln/UlnBase.sol:135-138`).
- Only the library owner, LayerZero Labs, sets defaults [C] code / [I] ops.
- Moderato's endpoint supports only 7 testnet EIDs; RH testnet's supports 21. The overlap is Sepolia
  40161, Base Sepolia 40245, OP Sepolia 40232, Fuji 40106 and Amoy 40267 [C scan of all 247 testnet EIDs].

**Testnet hop through Base Sepolia (40245)** [C]:
- Every leg is supported on-chain (`isSupportedEid`) in both directions.
- Default config is confirmations 1 with the **LayerZero Labs DVN**, not dead.
- Leg quotes:
  - RH testnet → Base Sepolia: executor 1.00e14 wei, DVN 5.44e12.
  - Base Sepolia → RH testnet: executor 1.00e14, DVN `0xe1a1…2d6` 5.70e12.
  - Moderato → Base Sepolia: executor 0.207 LZD, DVN 0.011.
  - Base Sepolia → Moderato: executor 1.00e14, DVN 5.72e12.
- Base Sepolia contracts: EndpointV2 `0x6edce65403992e310a62460808c4b910d972f10f`, Executor
  `0x8a3d588d9f6ac041476b094f97ff94ec30169d3d`, LZ Labs DVN `0xe1a12515f9ab2764b887bf60b923ca494ebbb2d6`.

### 5.3 OFT Adapter (lockbox) on Robinhood Chain

- `OFTAdapter` locks with `innerToken.safeTransferFrom(from, this, amountSentLD)` (`OFTAdapter.sol:82`)
  and unlocks with `safeTransfer(to, amountLD)` (`:102`) [C].
- "**ONLY 1 of these should exist for a given global mesh**" (`:14`). It assumes lossless transfers
  (`:16`). Robinhood's `Stock` charges no fee, so that holds [C].
- Decimal conversion rate = 10^(18−6) = 1e12 (`OFTCore.sol:56`) [C].
- The adapter must never be blocked. It is `msg.sender` in `transferFrom` and the spender in
  `approve` (mainnet) [C source].
- Unlock during a pause, or to a blocked recipient, reverts inside `lzReceive`. The message stays
  retryable on the endpoint, but a *blocked* recipient never clears. Use a custom `_credit` that
  escrows on failure [I].

### 5.4 Tempo side — minting a TIP-20 (vs a plain OFT ERC-20)

| | TIP-20 mirror + MintBurn adapter (recommended) | Plain `OFT` ERC-20 on Tempo |
|---|---|---|
| Token | Factory `createToken(name, symbol, currency, pathUSD, admin, salt, logoURI)` → `0x20c0…` address, 6 dec, TIP-403, memos, pause roles | Our own Solidity ERC-20 (`OFT.sol`), any decimals |
| Mint/burn | Adapter holds **`ISSUER_ROLE`**. `_credit` → `mint(to, amt)`; `_debit` → `transferFrom(user, adapter)` then `burn(amt)`, because an issuer "can burn only its own TIP-20 balance; TIP-20 does not expose `burnFrom`" (`migrate-erc20-to-tip20.md:163`) | Built in |
| `approvalRequired()` | true (user approves the TIP-20 to the adapter) — same as USDT0 `0xaf37…` and Frax [C] | false |
| Fee payment | Override `_payNative` to pull a whitelisted TIP-20, `LZEndpointDollar.wrap(token, endpoint, fee)`, return 0 (Frax `TempoAltTokenBase.sol:130-141`). The default `_payNative` reverts unless `msg.value == fee` (`OAppSender.sol:104-107`) | Same override needed |
| Precedent | USDC.e, USDT0, frxUSD, USDY, cbBTC (§5.5) | none found among listed Tempo tokens [I] |
| Caveats | Mint to a recipient whose receive policy blocks it is redirected to `ReceivePolicyGuard` (`migrate-erc20-to-tip20.md:315`). Mint to a new address is expensive: USDT0 sets **550k** `lzReceive` gas for Tempo (LZ Scan message `0x059a23ed…`). `ISSUER_ROLE` has no amount scoping (`:181`); enforce rate limits in the adapter | Gives up the TIP-20 features the design wants (S-1/S-3 in `09-…`) |

Frax's production reference, `FraxOFTMintableAdapterUpgradeableTIP20` (deployed; audit status not checked)
(FraxFinance/frax-oft-upgradeable@981a7b96fd85cd0d6e32cd1e1fd46331fbe6aebe) [C]:
- `contracts/FraxOFTMintableAdapterUpgradeableTIP20.sol:52-74` rejects `msg.value`.
- `:78-90` `_debit`: transferFrom then burn. `:94-104` `_credit`: mint. `:117-119` `_payNative` → LZD.
- Live on Tempo mainnet: `0x00000000d61733e7a393a10a5b48c311abe8f1e5`, `version()` "1.1.0",
  `nativeToken()` = LZD, holds ISSUER on frxUSD.
- Live on Moderato: proxy `0x16fbfcf4970d4550791faf75ae9baece75c85a27`, ISSUER on Moderato frxUSD
  `0x20c0…cf5b0f48f7fedc7f`, peer Sepolia `0x29a5…35c2`.
- License is **UNLICENSED**. Copy the pattern, not the file [I].

### 5.5 Precedent — how bridged tokens on Tempo are built [C]

| Token (Tempo) | TIP-20? | Bridge | Holder of `ISSUER_ROLE` | Evidence |
|---|---|---|---|---|
| USDC.e `0x20C0…b9537d11c60E8b50` | yes, currency USD, policy 1 | Stargate (LZ) | Stargate OFT `0x8c76e2F6C5ceDA9AA7772e7efF30280226c44392` | `hasRole(0x8c76…,ISSUER)` = true |
| USDT0 `0x20c0…14f22ca97301eb73` | yes, USD, policy 3 | LZ OFT | USDT0 OFT (proxy → impl `0x01bff417…1071`) `0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff`, `approvalRequired`=true, sharedDecimals 6 | mint tx `0x059a23ed…` via executor `0xf851…` → endpoint → `0xaf37…`; `hasRole` true |
| frxUSD `0x20c0…3554d28269e0f3c2` | yes, USD, policy 5 | LZ (Frax adapter) | `0x00000000d61733e7a393a10a5b48c311abe8f1e5` | mint tx `0x2003a7d3…`; `hasRole` true |
| USDY `0x20c0…d479b9f6ec0ceff9` | yes, currency "USDY", **policy 580** (non-default; compliance purpose [I]) | LZ OApp (Ondo) | `0xd45c2377241f1da765570e0d57920f1cf4855bcb` (`token()` = USDY) | mint tx `0xf77845fa…`; `hasRole` true — **an RWA with transfer policy bridged this way** |
| cbBTC `0x20c0…c412ec89d0c08be5` | yes, currency "BTC" | **CCIP** | `BurnMintTokenPool 1.6.1` `0x3b54b8c2bcbb673a42c98db9f6ec95128d46c71e` (TokenAdminRegistry pool; only remote selector 15971525489660198786 = Base [I]) | mint tx `0x86b283cd…` via `OffRamp 1.6.0` `0x819d…6102`; `hasRole` true |

Tempo's own guidance: "Existing canonical asset: use a bridge adapter … Lock or burn ERC-20, then mint
TIP-20 on Tempo through a bridge adapter", and grant the adapter `ISSUER_ROLE`
(`migrate-erc20-to-tip20.md:28,176`) [C].

## 6. Chainlink CCIP

| | RH mainnet | RH testnet | Tempo mainnet | Moderato |
|---|---|---|---|---|
| Router | `0x06fC836cf9839B1cd891C440A0a45242DA6Ae1c9` | `0x30D197C6F5bE050D5525dD94d01760FaCdB67e7C` | `0xa132F089492CcE5f1D79483a9e4552f37266ed01` | `0xD3e53cCEE3688aAEE5C9118ef5Fe24EB423aa56F` |
| Chain selector | `6180753054346818345` | `2032988798112970440` | `7281642695469137430` | `8457817439310187923` |
| TokenAdminRegistry | `0x1912C3cFafE8A76A32a92861d815aC2837F237Ca` | `0xad4c7a1430D140Fc5121C0697B2f7Efc655c0070` | `0x60A97bd9ACf755954Ff0fE85837224f2920a57F3` (v1.5.0) | `0x41a11E4955A8bAEC73e2c679db7EA21ffa1807e0` |
| RegistryModuleOwner | `0x3237c0D7B58BEc8Dc17F00103B784Bd6678f789E` | `0x00094197A82faDE614C214CFE27719dEDa898686` | `0x09AC52380E6Ede653E122773734fDc8b4B716422` (v1.6.0) | `0xa4eed8a7ebA3EC5f2e6678C1432280EdE120E8d2` |
| Token pool factory | `0x614B367841ec854994706f06AAB4aA2C80Fe06D9` | `0x3e9299b3A6D4B1f5AC9d11A115386845ECc74450` | `0x7227d723D07800700DA21Fa9e1a0107C78e76d74` | `0x1D87a6dE391247eF52E913B779Fd9ecB3A3E2238` |
| OnRamp version | 2.0.0 (1.6.0 to Solana) | 2.0.0 / 1.6.0 | 1.6.0 | 1.6.0 |
| Fee tokens | LINK, WETH, ETH | LINK, WETH, ETH | LINK, pathUSD, WTEMP, "USD" native | AlphaUSD, BetaUSD, ThetaUSD, pathUSD, LINK, WTEMP |
| Outbound lanes | 0G, Arbitrum, Base, Bittensor, BNB, Ethereum, Monad, Solana | Arb Sep, Fuji, Base Sep, BNB test, Core, Eth Sep, HyperEVM, Monad test, Solana devnet | Arbitrum, Avalanche, Base, Berachain, BNB, Ethereum, Ink, Katana, Linea, Plasma, Solana | Arb Sep, Fuji, Base Sep, BNB test, Eth Sep, Ink Sep, Plasma test, Solana devnet |

Source: docs.chain.link/ccip/directory/{mainnet,testnet}/chain/… (firecrawl, 2026-09-21) [C].

- **No lane in any direction** [C]. `Router.isChainSupported(<peer selector>)` = false and
  `getOnRamp(<peer selector>)` = `0x0` for RH→Tempo, Tempo→RH, RH testnet→Moderato and
  Moderato→RH testnet. Control: RH→Ethereum and Tempo→Arbitrum = true. Lanes are pairwise and operated
  by Chainlink [C directory / I ops].
- **CCT standard**:
  - Pool types: `LockReleaseTokenPool` (source-canonical) or `BurnMintTokenPool` (destination).
  - Self-serve admin registration through `RegistryModuleOwnerCustom`: token `owner()`,
    `getCCIPAdmin()` or AccessControl default admin. Then `TokenAdminRegistry.acceptAdminRole` →
    `setPool`, and per-remote `applyChainUpdates` with rate limits [I from CCT docs, not re-read today].
- **With a TIP-20**: the pool side works; cbBTC on Tempo is a TIP-20 minted by `BurnMintTokenPool 1.6.1`
  (§5.5) [C]. Self-serve registration does **not** fit: TIP-20 reverts on `owner()`,
  `getCCIPAdmin()` and OZ-order `hasRole(bytes32,address)` (error `0xaa4bc69a…`) [C]. cbBTC's admin
  `0xd31dB306…3EA1` was presumably set by the registry owner [I].
- CCIP 2.0 (`contracts-ccip-v2.0.0`, 2026-06-18) makes verifiers and executors permissionless
  (smartcontractkit/chainlink-ccip release notes) [C]. Tempo still runs 1.6.0 and the routers don't
  list each other, so this does not create a lane today [I].
- **Two-hop CCIP** (RH → Arbitrum/Base/Ethereum → Tempo, and the testnet equivalents) is technically
  possible with lanes that exist [C lanes]. It is inferior to LayerZero direct on mainnet [I].

## 7. Alternatives, evaluated

| Option | Mainnet | Testnet | Trust | Verdict |
|---|---|---|---|---|
| **LayerZero direct** (30416↔30410) | **Works**; set DVNs [C] | **Blocked** [C] | Chosen DVN set + OApp owner (can reconfigure) | **Mainnet choice** |
| **LayerZero OFT mesh via Base Sepolia** | n/a (direct exists) | **Works** with default LZ Labs DVN [C] | Same as above; adds a transit OFT on Base Sepolia | **Testnet choice** [I] |
| **Wormhole NTT** (hub = RH lock mode, spoke = Tempo burn mode) | Core on both (WH 72, 68), guardian set 7, VAAs observed on both, Executor supports both [C]. `NttManager` calls `ERC20Burnable.burn(uint256)` and `mint(address,uint256)` (native-token-transfers@250d810d `evm/src/NttManager/NttManager.sol:421-441,652`), which matches the TIP-20 interface [C code]. Tempo fee path via Executor in pathUSD not tested [I] | Moderato covered (VAAs June 2026); RH testnet core `0xBB73cB66…00dd` exists and is in guardian config, but **0 VAAs** indexed and **no Executor** [C] → manual relay, coverage unverified | Guardian set 7 = 19 guardians (supermajority quorum) [C count] | **Plan B on mainnet**. Testnet needs a live test (publish one message on RH testnet, watch testnet Wormholescan) |
| **Hyperlane warp route** | Mailboxes on both; RH default ISM has no route from 4217; Tempo mailbox never dispatched (`nonce`=0); RH→Tempo IGP quote is absurd (171.9 ETH) [C] | Not in registry → self-deploy core + own validator + relayer | Our validators (custom ISM) | Viable only as a self-operated bridge. Equal trust to our own relayer, with standard contracts [I] |
| **Own relayer** (Lockbox event → our key mints on Tempo; burn event → our key releases) | Possible | Possible | **Fully trusted key** (can mint unbacked or release) | Fallback only; disclose as trusted [I] |
| **Arbitrum canonical** | RH↔Ethereum only (7-day exit); Tempo is not an Orbit chain | same | — | **Not a path to Tempo** [C docs.robinhood.com/chain/bridging] |
| **CCIP direct** | No lane [C] | No lane [C] | — | Not available |

Other facts [C]:
- Wormhole core on Tempo mainnet: `0xbebdb6C8ddC678FfA9f8748f85C815C556Dd8ac6`, `messageFee`=0.
- Wormhole core on RH mainnet: `0x141fBa8AD5D61bdaB45A047cF60b5Ad9784987FB`.
- Wormhole core on Moderato: `0xa29E8c21924834E6249bCE1FD733f24eC492018c`.
- Existing NTT transceivers already run on both mainnets: Tempo "NTT Test USD" and RH "MULTI CAT".
- Hyperlane Tempo registry entry: `nativeToken` = pathUSD.

## 8. Non-token messages (multiplier, pause) over the same channel

- **Feasible [C protocol / I design]**. A LayerZero OApp carries arbitrary `bytes`. Use a separate
  **StockSync OApp pair** rather than overloading the OFT codec: OFT `_lzReceive` decodes
  `OFTMsgCodec`, and extra types would break OFT tooling.
- **Trigger**: a permissionless `sync(token)` on Robinhood Chain reads `uiMultiplier()`,
  `newUIMultiplier()`, `effectiveAt()`, `tokenPaused()`, the registry's `paused()` and
  `oraclePaused()` directly from the Stock contract, and sends them. Nobody has to be trusted for the
  *content*, only for the relay (the DVNs). Anyone may pay the ETH fee. A keeper watches
  `UIMultiplierUpdated` / `Paused` / `OraclePaused` logs.
- **Timing**: dividend updates arrive about 588 s before `effectiveAt` (§3.3). A RH→Tempo LayerZero
  message (RH ~100 ms blocks, Tempo deterministic finality) should land well inside that window [I].
  If it lands late, the companion still returns the right value because `uiMultiplier()` is a view
  comparing `block.timestamp` with `effectiveAt`.
- **Ordering**: LayerZero is unordered by default. Include `(srcTimestamp, seq)` and drop stale or
  duplicate updates; Robinhood re-sent CRWD (§3.3).
- **Wormhole alternative**: core `publishMessage` + VAA verification on Tempo works the same way.
- **CCIP arbitrary messaging**: no lane (§6).
- **Reverse direction**: no sync messages needed. Reserves are read directly: `RH.balanceOf(lockbox)`
  vs `Tempo.totalSupply()` [I].

## 9. Cost and latency

| Path | Fee currency | Quote (2026-09-21) | ≈ USD | Latency |
|---|---|---|---|---|
| LZ RH → Tempo | ETH `msg.value` | executor 9.1629e13 (200k gas) – 9.1704e13 (500k) wei + DVN 2.64–2.67e10 wei each | **≈ $0.25** | not measured on this pathway (an LZ Scan pathway query returned nothing even for busy pathways, so its filters are unreliable and traffic is unknown). Sample Polygon→Tempo USDT0 delivery: 79 s [C]. RH-sourced: likely < 2 min [I] |
| LZ Tempo → RH | **LZD** (wrap pathUSD/USDC.e/USDT0 1:1) | executor 0.299894 (200k) – 0.351613 (500k) LZD + DVN 0.018166–0.018378 each | **≈ $0.34–0.39** | Tempo finality ~0.5 s [I] |
| LZ testnet hop | ETH / LZD | 2 legs ≈ 2× testnet fees (free test funds) | $0 | 2× single leg [I] |
| Wormhole Executor RH → Tempo (500k gas) | ETH | `estimatedCost` 3.677e13 wei | ≈ $0.10 | Guardians wait for the RH "finalized" tag = Ethereum finality of the batch, likely tens of minutes [I] |
| Wormhole Executor Tempo → RH (500k gas) | pathUSD (`allowedFeeTokens`) | `estimatedCost` 165,618 (6 dec) | ≈ $0.17 | fast (Tempo final) [I] |
| Hyperlane default | — | RH IGP → Tempo: 1.719e20 wei (unusable) | — | — |
| CCIP | — | no lane | — | — |

- **How LayerZero prices fees on Tempo** [C]:
  - `quoteSend` returns `nativeFee` in LZD units (6 decimals, ≈ $1).
  - The OApp pulls a whitelisted stablecoin, calls `LZEndpointDollar.wrap(token, endpoint, fee)`, then
    `_lzSend` with `msg.value` = 0.
  - The executor pays Tempo gas in pathUSD. The USDT0 delivery tx `0x059a23ed…` shows a pathUSD
    Transfer.
- Gas prices at quote time: RH 0.0486 gwei, Tempo 0.6 gwei [C]. ETH $2,725.71 from
  `api.coingecko.com/api/v3/simple/price` 2026-09-21 [C].
- The SendUln302 treasury fee is not included [I].

## Recommended bridge design

**Pattern: OFT lockbox on Robinhood Chain → TIP-20 MintBurn adapter on Tempo (the Frax/USDT0 shape),
plus a StockSync OApp for corporate actions. Same contracts on mainnet and testnet; testnet adds one
hop.**

### Contracts

| Chain | Contract | Per | Role / notes |
|---|---|---|---|
| Robinhood (4663 / 46630) | `StockLockbox` = LayerZero `OFTAdapter` over the Robinhood `Stock` token | ticker | Holds real tokens. Custom `_credit` escrows on blocked/paused unlock. Inbound/outbound `RateLimiter`. Owner/delegate = Safe |
| Robinhood | `StockSyncSender` (OApp) | one | Permissionless `sync(token[])` reads Stock state and sends `SYNC_MULTIPLIER` / `SYNC_STATUS` |
| Tempo (4217 / 42431) | Mirror **TIP-20** via Factory: name e.g. "TSLA Stock Token (bridged, unofficial)" (no Robinhood marks), symbol owner's choice, `currency` = ticker, quote = pathUSD, logo self-hosted | ticker | `DEFAULT_ADMIN_ROLE` = Safe. **`ISSUER_ROLE` = adapter only.** `PAUSE_ROLE` = Safe (+ StockSync receiver if auto-pause is chosen). `UNPAUSE_ROLE` = Safe. Supply cap set deliberately |
| Tempo | `TIP20MintBurnOFTAdapter` (Frax pattern: `_debit` transferFrom+burn, `_credit` mint, `_payNative` → LZD) behind a proxy (deploy cost is ~$0.015 per max-size contract today, `16` §6 — the proxy is for upgradeability, not cost) | ticker | Enforced options: `lzReceive` gas ≥ 550k. Owner/delegate = Safe |
| Tempo | `StockSyncReceiver` (OApp) + `ScaledUIView` companion (ERC-165 0xa60bf13d / 0x4bd27648 / 0xd890fd71, `uiMultiplier`, `newUIMultiplier`, `effectiveAt`, `balanceOfUI`, `totalSupplyUI`, pause/oracle flags, emits `UIMultiplierUpdated`) | one registry keyed by mirror | Idempotent by `(srcTimestamp, seq)` |
| Base Sepolia (testnet only) | Transit `OFT` per ticker + `HopComposer` (lzCompose → forward to the final chain) + StockSync forwarder | ticker | Transit supply exists only in flight. Composer funded with test ETH, or executor `lzCompose` value |

### Message types

| Type | Direction | Payload |
|---|---|---|
| OFT SEND (standard codec: `sendTo` bytes32, `amountSD` uint64, optional compose) | RH ⇄ Tempo | Lock → mint; burn → unlock. 18↔6 decimals via `sharedDecimals`=6 |
| `SYNC_MULTIPLIER` (0x01) | RH → Tempo | `rhToken, uiMultiplier, newUIMultiplier, effectiveAt, srcTimestamp, seq` |
| `SYNC_STATUS` (0x02) | RH → Tempo | `rhToken, tokenPaused, registryPaused, oraclePaused, seq` |

### Security configuration (mainnet)

- Required DVNs on both ends: **LayerZero Labs + Nethermind**, optionally Horizen. Arrays sorted
  ascending.
  - RH `SendUln302` for eid 30410: `[0x0ffe02df…fdf8, 0xd01ae690…5b12]`.
  - Tempo `ReceiveUln302` for eid 30416: `[0x0d875bd6…b1cb, 0x76faff60…9961]`.
  - Mirror the pairing for the reverse path.
- Confirmations are an owner choice, e.g. 20 RH blocks (~2 s) [I].
- Executors: RH `0x4208…0a0b`, Tempo `0xf851…d7b2`.
- **Never leave defaults.** They point at the dead DVN (F16).
- The Safe that owns the OApps can change DVNs and peers, so it can mint unbacked. This is the trust
  root; disclose it alongside the issuer powers in §3.2.

### Testnet vs mainnet

| | Testnet | Mainnet |
|---|---|---|
| Source tokens | 5 faucet tokens (§2.2), real testnet Stock Tokens | Any of 195 (§2.1), bought on Robinhood Chain venues |
| Route | RH testnet 40451 → **Base Sepolia 40245** → Moderato 40444 (and back), default LZ Labs DVN | **Direct** 30416 ⇄ 30410, explicit DVNs |
| Multiplier sync | Exercisable only as no-ops (all testnet multipliers = 1.0; testnet impl has no `oraclePaused`) | Real (32 tokens ≠ 1.0; ~10-min lead) |
| Reserve view | `balanceOf(lockbox)` on 46630 vs `totalSupply` on 42431 (+ transit supply on 84532) | `balanceOf(lockbox)` on 4663 vs `totalSupply` on 4217 |
| If LayerZero enables 40451↔40444 | Collapses to the mainnet shape (drop the hop) | — |

## Blockers

1. **No direct testnet pathway** (LayerZero 40451↔40444, CCIP either way). Workarounds:
   - the Base Sepolia hop [C viable, untested end-to-end];
   - ask LayerZero to enable the pathway [unverified whether they will];
   - Wormhole, if the RH testnet guardian coverage checks out [unverified].
2. **No CCIP lane RH↔Tempo on mainnet**. CCIP is out unless Chainlink adds one, or a two-hop is used.
3. **Issuer powers over the lockbox**: blocklist, global/token pause, `burn`/`adminBurn` from any
   address, beacon upgrade (§3.2). Backing is only as good as RHJ's non-interference. The reserve panel
   must be live and the disclaimer must say so.
4. **Legal**:
   - The mirror is not an RHJ security.
   - Delivering exposure to US or other restricted persons is prohibited under RHJ's selling
     restrictions.
   - ToS forbids Robinhood marks in token names and metadata.
   The owner's answer is the disclaimer. The owner must also personally be eligible to acquire mainnet
   Stock Tokens.
5. **TIP-20 cannot host ERC-8056**. Integrators must use the companion contract, and per-transfer UI
   events are not replicable.
6. **Deploy cost on Tempo** is 5–10× Ethereum *in gas* but ≈ $0.015 per max-size contract in dollars
   (`16` §6); the constraint is block space (30M gas/block general lane), not money.
7. **Unverified runtime behaviours**:
   - RH-sourced LayerZero latency.
   - Tempo gas for `lzReceive` + TIP-20 mint to a fresh address (550k is USDT0's setting).
   - Executor native-value support for the testnet compose hop.
   - The SendUln302 treasury fee.

## Open questions for the owner

1. Confirm **Robinhood Chain** as the source (all findings support it).
2. Testnet route: **LayerZero hop via Base Sepolia** (recommended; standard infrastructure), a request
   to LayerZero for a direct 40451↔40444 pathway, or our own relayer (trusted, disclosed)?
3. Mainnet ticker set per theme, remembering one lockbox + one TIP-20 + one adapter per ticker.
   GLD, SLV and USO are available for "gold/commodities".
4. Are you eligible (non-US/CA/UK/CH, not sanctioned) to buy mainnet Stock Tokens, and what budget
   should go to real tokens to lock?
5. Mirror naming and symbol convention (no "Robinhood"), and logo hosting.
6. Should a Robinhood pause **auto-pause** the Tempo mirror (via `PAUSE_ROLE` on the receiver), or only
   be displayed?
7. Key custody: which Safe owns the OApps and the TIP-20 admin, and what signer threshold?
8. DVN set and confirmations: LayerZero Labs + Nethermind (default proposal), plus Horizen?
9. One OFT adapter per ticker (standard, LZ Scan-legible), or one multi-asset custom OApp (fewer Tempo
   deployments, non-standard)?
10. Should Wormhole NTT be kept as a documented mainnet plan B?

## Appendix A — full mainnet list (195), alphabetical

Addresses from docs.robinhood.com/chain/contracts, cross-checked against `api.robinhood.com/rhj/assets`
(0 mismatches). Supply and multiplier read by batched `eth_call` on `rpc.mainnet.chain.robinhood.com`,
2026-09-21 ~12:40 UTC [C]. No token was paused or oracle-paused at read time [C].

| # | Symbol | Name (docs registry; suffix " • Robinhood Token" dropped) | Contract (Robinhood Chain 4663) | Supply | `uiMultiplier` |
|---|---|---|---|---|---|
| 1 | AAOI | Applied Optoelectronics | `0x521Cf887E6531c6F667b5BC4D896E5d9bfE8EB2E` | 295.07 | 1.00000000 |
| 2 | AAPL | Apple | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` | 16,234.05 | 1.00056608 |
| 3 | ABCL | Abcellera Biologics | `0x3139D77Ace0cbAA5bDfD38bD1F1911a794AF0B0e` | 1,035.87 | 1.00000000 |
| 4 | ADBE | Adobe | `0x232B8ed6377BE97813853B0Ac104c4Cda8378d1B` | 227.50 | 1.00000000 |
| 5 | AEHR | Aehr | `0x5F604fBA1162193A4388A5DFa56F556f3E133cC2` | 104.75 | 1.00000000 |
| 6 | AEIS | Advanced Energy | `0xfAf9cb261B5FCC1f404Bb10CD39C5c6C1974E612` | 56.31 | 1.00000000 |
| 7 | ALAB | Astera Labs, Inc. | `0x748c32c3ca24eDf31ea597Db1F3d330a7a6DA3Dc` | 57.60 | 1.00000000 |
| 8 | AMAT | Applied Materials | `0x36046893810a7E7fCE501229d57dc3FC8c8716d0` | 254.27 | 1.00004466 |
| 9 | AMBA | Ambarella | `0x99D9D8663545151603863C5AcbD6FC3218899009` | 268.80 | 1.00000000 |
| 10 | AMC | AMC Entertainment | `0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B` | 1,205,169.14 | 1.00000000 |
| 11 | AMD | AMD | `0x86923f96303D656E4aa86D9d42D1e57ad2023fdC` | 3,148.55 | 1.00000000 |
| 12 | AMKR | Amkor Technology | `0xDd356AA38F40A7b7076755aC854B6FBb1F0D305B` | 248.42 | 1.00000000 |
| 13 | AMZN | Amazon | `0x12f190a9F9d7D37a250758b26824B97CE941bF54` | 13,635.77 | 1.00000000 |
| 14 | ANET | Arista | `0x28bABD556b60E53663B8615036479a29c2CDd1Bf` | 93.97 | 1.00000000 |
| 15 | APLD | Applied Digital | `0xb8DBf92F9741c9ac1c32115E78581f23509916FD` | 598.19 | 1.00000000 |
| 16 | APP | AppLovin | `0xA249BAF1063Af884807C1E1400AEf7784836917E` | 96.97 | 1.00000000 |
| 17 | ASML | ASML Holding NV | `0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA` | 123.68 | 1.00010132 |
| 18 | ASTS | AST SpaceMobile | `0x1AF6446f07eb1d97c546AFC8c9544cBDF3AD5137` | 867.90 | 1.00000000 |
| 19 | AUR | Aurora Innovation | `0x373C06c4f7BDe527D7Dae4BA169E42b55E393CeD` | 2,848.89 | 1.00000000 |
| 20 | AVAV | AeroVironment | `0xF6290b5e7C26502e2dA514C31509849718EA76A5` | 115.73 | 1.00000000 |
| 21 | AVGO | Broadcom | `0x156E175DD063a8cE274C50654eF40e0032b3fbcF` | 566.72 | 1.00125732 |
| 22 | AXON | Axon | `0xC27dBD474aF5181c5A8777903690D8D262D12648` | 26.42 | 1.00000000 |
| 23 | AXTI | AXT | `0x141eEa040c2250eEc0314e336975e81f85f6585e` | 218.32 | 1.00000000 |
| 24 | BA | Boeing | `0x4D21483a44Bf67a86b77E3dA301411880797D452` | 1,360.50 | 1.00000000 |
| 25 | BABA | Alibaba | `0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4` | 5,172.86 | 1.00000000 |
| 26 | BB | Blackberry | `0x48E39E56aCdbA37b09020C0b734A613C9a2f100A` | 64,791.18 | 1.00000000 |
| 27 | BE | Bloom Energy | `0x822CC93fFD030293E9842c30BBD678F530701867` | 3,259.29 | 1.00000000 |
| 28 | BND | Vanguard Total Bond Market ETF | `0x2F62fC9fAbb470C690f141c28340eD832bB27020` | 0.00 | 1.00000000 |
| 29 | BULL | Webull | `0xceF9027c7d6985b85f0BA431125073529A947A68` | 37,874.68 | 1.00000000 |
| 30 | CBRS | Cerebras Systems | `0x5c90450Bbb4273D7b2f17CF6917AEB237A569679` | 608.06 | 1.00000000 |
| 31 | CCL | Carnival Corporation | `0x9651342CeA770aE9a2969Ba2A52611523146aef9` | 2,234.39 | 1.02148644 |
| 32 | CEG | Constellation Energy | `0xaE517A2903E68bd929Dfd15be875F8369D53e94a` | 249.30 | 1.00000000 |
| 33 | CELH | Celsius | `0x8cF07C5A878945185d327aAa6e33FAa95F95e7bF` | 796.02 | 1.00000000 |
| 34 | CIEN | Ciena | `0x44f6D488021f8233B9416294d1FE9b1fEe28382d` | 29.78 | 1.00000000 |
| 35 | CLOV | Clover Health Investments | `0x62200915e7DEab1eC7f79fb246daDbB80eACdDd0` | 3,589.48 | 1.00000000 |
| 36 | CLS | Celestica | `0xBf449977089c718C004a66C554B26B94ef3Ad4De` | 40.68 | 1.00000000 |
| 37 | CLSK | CleanSpark | `0xcBB95BBF36099d34dA091dc6Fa6F49EfA257Cee3` | 813.79 | 1.00000000 |
| 38 | COHR | Coherent | `0x92F9F459F1a9a5AD266b182BE7Bffd1C6c666894` | 56.87 | 1.00000000 |
| 39 | COIN | Coinbase | `0x6330D8C3178a418788dF01a47479c0ce7CCF450b` | 10,743.98 | 1.00000000 |
| 40 | COST | Costco | `0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2` | 1,498.69 | 1.00061204 |
| 41 | CRCL | Circle Internet Group | `0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5` | 41,590.09 | 1.00000000 |
| 42 | CRDO | Credo Technology Group | `0x4D67253bc223e6b0e104F1084c1fb2b669dDC41b` | 176.18 | 1.00000000 |
| 43 | CRM | Salesforce | `0xd95B44124e475743a7589e68F3D74008A5536D44` | 372.83 | 1.00114832 |
| 44 | CRWD | CrowdStrike Holdings | `0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931` | 19.51 | 4.00000000 |
| 45 | CRWV | CoreWeave | `0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3` | 6,169.64 | 1.00000000 |
| 46 | CSCO | Cisco Systems | `0xF543967EEBB6f1917992eF0E68De63ab07a5a0dA` | 225.66 | 1.00000000 |
| 47 | CTSH | Cognizant | `0x63D5a3b6939a33f1e75d8Bcd85759858239600DB` | 238.16 | 1.00000000 |
| 48 | CVNA | Carvana | `0xa4f319104089FE321dc8093C6E707d4fE190A988` | 1,675.88 | 1.00000000 |
| 49 | DDOG | Datadog | `0x27c99fBde9D0d2AA4f4Bfb4943f237843DdF6958` | 813.22 | 1.00000000 |
| 50 | DELL | Dell | `0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd` | 647.75 | 1.00006371 |
| 51 | DJT | Trump Media & Technology Group | `0x1D11f0496982706C5e14A514D4E79F2e6BdE4516` | 233,383.08 | 1.00000000 |
| 52 | DOCN | DigitalOcean | `0xc02f12B9fe9E707079EC0d546f3050d3F6C1F8bD` | 150.97 | 1.00000000 |
| 53 | ELF | e.l.f. Beauty | `0x39EC44Bee4F6A116c6F9B8De566848a985C53C60` | 422.74 | 1.00000000 |
| 54 | EWT | iShares MSCI Taiwan Capped ETF | `0x1c690498150252222C275A5CEd69d3A6b1f52D5E` | 157.75 | 1.00000000 |
| 55 | EWY | iShares MSCI South Korea fund | `0x7f0aBeF0C07280F82c6a08ead09dEd6BAE2C13Fc` | 1,049.02 | 1.00000000 |
| 56 | F | Ford Motor | `0x25C288E6D899b9BC30160965aD9644c67e73bE0C` | 17,779.25 | 1.00014550 |
| 57 | FICO | Fair Isaac | `0xa48F22A46C0F1C46CA7D111CB6c137c271987180` | 17.19 | 1.00000000 |
| 58 | FIG | Figma | `0x41F4267525a8AFf329540eF24fD83d9044758B33` | 13,459.69 | 1.00000000 |
| 59 | FISV | Fiserv | `0x9ECe29A4A2397C0a35fb5fA8EE2b9509130a98cc` | 367.86 | 1.00000000 |
| 60 | FIX | Comfort Systems | `0x93Dbb1d2Dc5D63F4abACFF30485273f538Df68Ac` | 19.99 | 1.00000000 |
| 61 | FLNC | Fluence Energy | `0x282e87451E10fA6679BC7D76C69BE44cD3fC777C` | 1,450.43 | 1.00000000 |
| 62 | FLY | Firefly Aerospace Inc. | `0x03BC731Ffb162cdd7B98D3C6542bFC291126075d` | 1,332.19 | 1.00000000 |
| 63 | FTNT | Fortinet | `0x3FB8976980d486084b2eb4a404BD12e72823958f` | 70.57 | 1.00000000 |
| 64 | FUTU | Futu Holdings | `0xeB30663bDFf0622Ef4e4E5cBb4E975F19f33f51D` | 333.32 | 1.00000000 |
| 65 | GE | General Electric | `0x63b814DDBd6BF339f25Fed8c36158a008D5B373e` | 219.59 | 1.00000000 |
| 66 | GEV | GE Vernova | `0x94B8AAE43A1cCc08Aa64B7D1F29b4D920aF4a0C9` | 14.59 | 1.00000000 |
| 67 | GLD | SPDR Gold Trust | `0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e` | 21,039.65 | 1.00000000 |
| 68 | GLW | Corning | `0x7c04E6A3368F2A1DE3874f0e80d2e0A1a9915da6` | 78.17 | 1.00000000 |
| 69 | GLXY | Galaxy Digital Inc. | `0x2D427692E928fa156ec22acfaBaFA0447C5805B7` | 11,730.80 | 1.00000000 |
| 70 | GME | GameStop | `0x1b0E319c6A659F002271B69dB8A7df2F911c153E` | 148,603.62 | 1.00000000 |
| 71 | GOOGL | Alphabet Class A | `0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3` | 15,775.29 | 1.00019392 |
| 72 | HII | Huntington Ingalls | `0xEB61c0Ed490A367d4E3631cCf8a74B3bfc7E775D` | 52.91 | 1.00000000 |
| 73 | HIMS | Hims & Hers Health | `0xCceE82fE024c36fA15E1005edE3E9e4787e23D09` | 131,207.39 | 1.00000000 |
| 74 | HPE | HP Enterprise | `0x59dd09d4900C2E4B5F75b7c0d4E6796fcc234Cb1` | 750.49 | 1.00171696 |
| 75 | HWM | Howmet Aerospace | `0xAEa445c5F3DB1a462998ccC422A875A361ee5d99` | 74.09 | 1.00000000 |
| 76 | IBM | IBM | `0x980dcf6766FA79f5Cf0c4AAdb3ab477ff15a9619` | 2,387.90 | 1.00000000 |
| 77 | IBRX | ImmunityBio, | `0x7c148F74ac7445D1F28366b7FcDC6792a9Fcd0Cf` | 2,000.97 | 1.00000000 |
| 78 | INDA | iShares MSCI India ETF | `0xACEF2e09adb47aD6aBeBAD9fF06689E60615C2B6` | 3,676.56 | 1.00000000 |
| 79 | INFQ | Infleqtion | `0xB853bC83a753342a4f8320ea680b4B1E84118D21` | 2,371.42 | 1.00000000 |
| 80 | INOD | Innodata | `0xf1953DAB6FaD537488d5A022361FfAa8B4c95eC6` | 301.41 | 1.00000000 |
| 81 | INTC | Intel | `0xc72b96e0E48ecd4DC75E1e45396e26300BC39681` | 17,197.42 | 1.00000000 |
| 82 | INTU | Intuit | `0x56d23beE5f41A7120170b0c603Dae30128e460e9` | 71.60 | 1.00000000 |
| 83 | IONQ | IonQ | `0x558378E000D634A36593E338eBacdd6207640EfE` | 603.69 | 1.00000000 |
| 84 | IREN | IREN Limited | `0xF0AB0c93bE6F41369d302e55db1A96b3c430212D` | 589.73 | 1.00000000 |
| 85 | JBL | Jabil Inc. | `0xEAf2512dFC1bEAc608F8794B3793CD4E02894Aa6` | 31.46 | 1.00000000 |
| 86 | JNJ | Johnson & Johnson | `0x03DfbBE0AC4E7bCDaFd08eD41A400326B77D8c80` | 1,025.49 | 1.00002149 |
| 87 | JOBY | Joby Aviation | `0xb334C5cE741B80B5B671F47F5C269Cb193fe8E24` | 3,231.25 | 1.00000000 |
| 88 | KLAC | KLA | `0x96b933C74eCB4A0926b9210cef7b743EF46be2E9` | 60.70 | 1.00000000 |
| 89 | KSS | Kohls Corporation | `0x12e3c047bf9AeCAF9dDC98c05C31BFD1dd043993` | 1,325.48 | 1.00461007 |
| 90 | KTOS | Kratos Defense & Security Solutions | `0x7FD06a4d81cCfA3F351394E144d5191874C31313` | 337.34 | 1.00000000 |
| 91 | LHX | L3Harris | `0x48d60243c66437c6ac3c2495Be94747aEd5Dfe25` | 60.38 | 1.00000000 |
| 92 | LITE | Lumentum | `0x8eF20885F94e3D9bc7eB3080279188Bd5ED7c08C` | 247.20 | 1.00000000 |
| 93 | LLY | Eli Lilly | `0x8005d266423c7ea827372c9c864491e5786600ea` | 1,793.50 | 1.00000229 |
| 94 | LMT | Lockheed | `0x329fcACEb9AD6F9580DD5F643fed0646900D043c` | 616.98 | 1.00000000 |
| 95 | LRCX | Lam Research Corp | `0x57b0030166DB0C31690d1A5aA167e2e26e2C29a4` | 48.46 | 1.00000000 |
| 96 | LULU | Lululemon | `0x4e62068525Ab11FE768e29dfD00ef909B9803016` | 6,837.32 | 1.00000000 |
| 97 | LUNR | Intuitive Machines | `0xa5D4968421bA94814Be3B136b15cf422101aC1a3` | 1,179.43 | 1.00000000 |
| 98 | MDB | MongoDB | `0xDdf2266b79abf0B48898959B0ed6E6adf512be74` | 43.37 | 1.00000000 |
| 99 | META | Meta Platforms | `0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35` | 7,603.38 | 1.00054146 |
| 100 | MOD | Modine | `0xc6Cbad1016b38B797610c25E1dc7D95988B1f362` | 79.63 | 1.00000000 |
| 101 | MPWR | Monolithic Power Systems | `0x52D50D0280AD1054b43f052bD70a49a212A1b128` | 14.36 | 1.00000000 |
| 102 | MRNA | Moderna | `0x43B07D15cE533bEc5476d70C22a78a1B2B662155` | 4,118.69 | 1.00000000 |
| 103 | MRVL | Marvell Technology | `0x62fd0668e10D8B72339BE2DCF7643001688ff13B` | 1,507.20 | 1.00000000 |
| 104 | MSFT | Microsoft | `0xe93237C50D904957Cf27E7B1133b510C669c2e74` | 6,026.57 | 1.00041295 |
| 105 | MSTR | Strategy Inc. | `0xec262a75e413fAfD0dF80480274532C79D42da09` | 19,683.17 | 1.00000000 |
| 106 | MTSI | MACOM | `0xC93f4d80e268AB922e871bd169156C3CC41894e6` | 58.48 | 1.00000000 |
| 107 | MU | Micron Technology | `0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD` | 4,523.37 | 1.00007482 |
| 108 | MXL | MaxLinear | `0x48961813349333209994750ffA89b3c5C22eC969` | 248.35 | 1.00000000 |
| 109 | NAVN | Navan | `0xf7181b63Fdb858558A74ba96BC42732684cd7965` | 394.30 | 1.00000000 |
| 110 | NBIS | Nebius Group | `0x9D9c6684F596F66a64C030B93A886D51Fd4D7931` | 1,333.28 | 1.00000000 |
| 111 | NET | Cloudflare, Inc. Class A common stock | `0x116F00968269B7bfbaD4109cE591d6E74c0601d4` | 566.29 | 1.00000000 |
| 112 | NFLX | Netflix | `0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8` | 11,774.78 | 1.00000000 |
| 113 | NNE | Nano Nuclear Energy | `0xBEF75684C43c4ea7BD18Dd532a2244674Ee8b926` | 16,016.35 | 1.00000000 |
| 114 | NOW | ServiceNow | `0x0C3260aF4B8f13a69c4c2dFb84fD667890CDFa14` | 228.86 | 1.00000000 |
| 115 | NU | Nu | `0x408c14038a04f7bD235329E26d2bf569ee20e250` | 18,283.76 | 1.00000000 |
| 116 | NVDA | NVIDIA | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | 91,825.15 | 1.00077516 |
| 117 | NVTS | Navitas Semiconductor | `0xbE6702d7b70315376dC48a3293f24f0982F86386` | 842.15 | 1.00000000 |
| 118 | OKLO | Oklo | `0x8B2f88497f15A18E9D4FFa1a8fFB8538399aE774` | 390.58 | 1.00000000 |
| 119 | ON | ON Semiconductor | `0xbBD09F72b025360FeE5C928053Dca6248d35be54` | 1,083.26 | 1.00000000 |
| 120 | ONTO | Onto Innovation | `0x8ff63eAeEe3fE54Ba450c4F5538064Ec5A893Aef` | 38.85 | 1.00000000 |
| 121 | ORCL | Oracle | `0xb0992820E760d836549ba69BC7598b4af75dEE03` | 6,198.44 | 1.00221091 |
| 122 | OUST | Ouster | `0x40E7a279850e443f582059ae5dC1c3b6563E6395` | 359.91 | 1.00000000 |
| 123 | P | Everpure | `0x1Cdad396DB64BDa184d5182A97Dd9B3C62100b7D` | 293.27 | 1.00000000 |
| 124 | PANW | Palo Alto Networks | `0xB039597eD45CBa7B6E2fb9E8BE51802969CEe5Be` | 50.33 | 1.00000000 |
| 125 | PATH | UiPath | `0xfb2664f07B6Aadd29ea7a59D8859b1AeB8645cDa` | 1,346.78 | 1.00000000 |
| 126 | PENG | Penguin Solutions | `0x9b23573b156B52565012F5cE02CDF60AFBaa70Be` | 2,508.42 | 1.00000000 |
| 127 | PFE | Pfizer | `0x7066A64c24e4206CD62E83bf198c1E7EB361F51e` | 12,754.75 | 1.00000000 |
| 128 | PL | Planet Labs | `0xAA4d64474c172010aB57719cb9951E6142a100d3` | 1,166.49 | 1.00000000 |
| 129 | PLTR | Palantir Technologies | `0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A` | 13,881.62 | 1.00000000 |
| 130 | POET | POET Technologies | `0xcf6B2D875361be807EAfa57458c80f28521F9333` | 3,019.62 | 1.00000000 |
| 131 | POWL | Powell Industries | `0x237c16D66590F67B886d978ACD362EAeaD8B18c7` | 101.12 | 1.00000000 |
| 132 | PR | Permian Resources | `0x4189F0c66EBBB0bfeF1C31f763131361EF32f77C` | 573.34 | 1.00447794 |
| 133 | PWR | Quanta | `0x9Ab02Ead789b6903c3c44d0ED32F9c707CDF12FD` | 19.03 | 1.00000000 |
| 134 | QBTS | D-Wave Quantum Inc. Common Stock | `0xC583c60aeF9Dc401Da72cEC1B404743a93cea1Cc` | 1,253.88 | 1.00000000 |
| 135 | QCOM | Qualcomm | `0x0f17206447090e464C277571124dD2688E48AEA9` | 140.69 | 1.00000000 |
| 136 | QNT | Quantinuum Inc. Class A | `0xB7EDfE2F33C1aC06830a971dFb559bDe8A2a3d76` | 0.00 | 1.00000000 |
| 137 | QQQ | Invesco QQQ | `0xD5f3879160bc7c32ebb4dC785F8a4F505888de68` | 7,117.88 | 1.00000000 |
| 138 | QUBT | Quantum Computing | `0x59818904ab4cE163b3cE4FfB64f2D6Ca02c434B4` | 23,608.10 | 1.00000000 |
| 139 | RBLX | Roblox | `0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8` | 17,572.16 | 1.00000000 |
| 140 | RCAT | Red Cat | `0xFDE6b5d9BB419B10C23268c74e369AbFF39C0460` | 32,822.99 | 1.00000000 |
| 141 | RDDT | Reddit | `0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C` | 16,005.21 | 1.00000000 |
| 142 | RDW | Redwire | `0x92Ef19E82bD8fF36661DE838D5eaE7e5CEF0EfFE` | 1,767.39 | 1.00000000 |
| 143 | RGTI | Rigetti Computing | `0x284358abc07F9359f19f4b5b4aC91901Be2597Ba` | 1,077.55 | 1.00000000 |
| 144 | RIVN | Rivian Automotive | `0xB1BF26c1D20ff267A4f93550d1E0d06ac40a114B` | 32,717.42 | 1.00000000 |
| 145 | RKLB | Rocket Lab Corporation | `0x3b14C39E89D60D627b42a1A4CA45b5bb45Fc12e2` | 1,532.36 | 1.00000000 |
| 146 | RUN | Sunrun | `0x756Bc80af765C82da966a788858d65aDF14f3793` | 5,703.33 | 1.00000000 |
| 147 | SATS | EchoStar | `0x95052ddcd5DC25641657424A8Cf04834997E1730` | 0.10 | 1.00000000 |
| 148 | SCHD | Schwab US Dividend Equity ETF | `0xd63ABB2C13d7a8421a8017a712802053568e3C1D` | 581.78 | 1.00000000 |
| 149 | SGOV | iShares 0-3 Month Treasury Bond | `0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5` | 37,904.22 | 1.00510177 |
| 150 | SHOP | Shopify | `0xF53F66751B1Eff985311b693531E3290F600c410` | 1,875.69 | 1.00000000 |
| 151 | SHY | iShares 1-3 Year Treasury Bond ETF | `0xBE274710Bf3d9567e1B290eF6a5F9f90ca016FD8` | 195.45 | 1.00000000 |
| 152 | SIMO | Silicon Motion | `0x77E655E37F4d913fB9540e0d541D824171a60e81` | 88.70 | 1.00000000 |
| 153 | SKHY | SK hynix Inc. American Depositary Shares | `0x84CAb63bc87912E71ad199ff14A0bA45de68FeF8` | 4,621.18 | 1.00000000 |
| 154 | SLS | SELLAS Life Sciences | `0x285b231728c7E4333799183DF1094d775246a535` | 1,231.00 | 1.00000000 |
| 155 | SLV | iShares Silver Trust | `0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f` | 22,090.49 | 1.00000000 |
| 156 | SMCI | Super Micro Computer | `0xc01aA1fECeC0605b13bc84874ff7256C0f5F562a` | 755.71 | 1.00000000 |
| 157 | SMH | VanEck Semiconductor ETF | `0x072f979c2CAc8e1391B0162a87Fee094bF8744a0` | 203.83 | 1.00000000 |
| 158 | SMR | NuScale Power | `0x1Eebee7F74517e0279dFb09d25B0407bEEc3FDd6` | 2,819.35 | 1.00000000 |
| 159 | SNAP | Snap | `0xF6589F11Bc40b669e584073F428B05562F568733` | 157,992.07 | 1.00000000 |
| 160 | SNDK | Sandisk Corporation | `0xB90A19fF0Af67f7779afF50A882A9CfF42446400` | 940.35 | 1.00000000 |
| 161 | SNOW | Snowflake | `0xBa0CAB75495255d0cB58E22B648bFED4ECD1F47E` | 565.24 | 1.00000000 |
| 162 | SOFI | SoFi Technologies | `0x98E75885157C80992A8D41b696D8c9C6Fb30A926` | 2,709.32 | 1.00000000 |
| 163 | SOUN | SoundHound AI | `0x6E3Dfd9f7e1649BaA14D25cac18C94d62dB10A54` | 10,976.12 | 1.00000000 |
| 164 | SOXX | iShares Semiconductor ETF | `0x75742c18BC1f1C5c5f448f4C9D9C6F66dafAAa38` | 252.08 | 1.00045084 |
| 165 | SPCX | Space Exploration Technologies Corp. Class A Common Stock | `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa` | 71,639.90 | 1.00000000 |
| 166 | SPMO | Invesco S&P 500 Momentum ETF | `0xAd622320e520de39e72d41EF07438C3Fd3354875` | 119.34 | 1.00000000 |
| 167 | SPY | SPDR S&P 500 ETF Trust | `0x117cc2133c37B721F49dE2A7a74833232B3B4C0C` | 31,651.03 | 1.00171799 |
| 168 | TE | T1 Energy | `0xb1969f6604CA1AE7a2cD3F1827876e914594CA2D` | 6,806.02 | 1.00000000 |
| 169 | TEAM | Atlassian Corporation | `0x5B97476b922F3305131B8f0B9D333172E87f4aaE` | 96.34 | 1.00000000 |
| 170 | TEM | Tempus AI | `0xB1CC0EC7Db69Cf43539119814df40071b9d61793` | 191.86 | 1.00000000 |
| 171 | TER | Teradyne | `0x2778C5024D5cA2CdB0f8eAD671ffc69963AdCD9C` | 67.30 | 1.00000000 |
| 172 | TSEM | Tower Semiconductor | `0x89776d4Cd68193597A2fC132cfaC1fDe36CCeA8a` | 94.29 | 1.00000000 |
| 173 | TSLA | Tesla | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d` | 13,552.06 | 1.00000000 |
| 174 | TSM | Taiwan Semiconductor Manufacturing | `0x58FfE4a942d3885bAa22D7520691F611EF09e7AA` | 3,553.38 | 1.00146302 |
| 175 | TTD | Trade Desk | `0x0b5fb4031cae9163db10B169Ee72685F0EdC8545` | 1,027.65 | 1.00000000 |
| 176 | TTWO | Take-Two Interactive Software | `0x5e81213613b6B86EaB4c6c50d718d34359459786` | 6,400.52 | 1.00000000 |
| 177 | UMC | United Microelectronics | `0x0E6e67Ba88e7b5d9B67636A215c76779B948dE79` | 846.71 | 1.00000000 |
| 178 | UNH | UnitedHealth | `0xcF364ea52787e289De6F32077834056E3E70D6A8` | 97.01 | 1.00424150 |
| 179 | UPS | UPS | `0xf23250dac154D05Bb671CB0d0eBEf3c635c79CE2` | 2,577.52 | 1.00220872 |
| 180 | USAR | USA Rare Earth | `0xd917B029C761D264c6A312BBbcDA868658eF86a6` | 41,476.38 | 1.00000000 |
| 181 | USO | United States Oil Fund | `0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344` | 18,168.35 | 1.00000000 |
| 182 | VICR | Vicor | `0x6006ed4B2F94110851ff7509D97D034f0EeD9226` | 63.28 | 1.00000000 |
| 183 | VRT | Vertiv | `0xFA78C12E6488814A0262E4e802749a4a737d5fB7` | 78.73 | 1.00016279 |
| 184 | VSAT | ViaSat | `0x26dCbfb34FC83CAbD6990f449674efDc6097fF85` | 178.08 | 1.00000000 |
| 185 | VST | Vistra | `0x561e2a49212b7cCF47f2744Ccb83e200722fADBc` | 147.02 | 1.00111474 |
| 186 | VTI | Vanguard Morningstar Total Stock Market ETF | `0x0594134DF3f171a354D9C85eBD65b7A6148F6D09` | 152.37 | 1.00000000 |
| 187 | WDAY | Workday | `0x82DA4646242e1D962e96e932269Dc644c94a9CaA` | 289.38 | 1.00000000 |
| 188 | WDC | Western Digital | `0xF52597345A8Edf418bc4071b4a35112472277D3e` | 193.91 | 1.00021757 |
| 189 | WULF | TeraWulf | `0x348Be1A8663f15edDe5CDf8A96BB69078f7aB6Fd` | 1,404.82 | 1.00000000 |
| 190 | WYFI | WhiteFiber, Inc. | `0x9e7ABD3C9139D14E4c86DcE0e455AAB7A0C2FB3E` | 8,078.00 | 1.00000000 |
| 191 | XLK | State Street Technology Select Sector SPDR ETF | `0x15Cd20759CE7F3285c29A319dE2D1A2e098c6f43` | 86.28 | 1.00080440 |
| 192 | XNDU | Xanadu Quantum | `0xA8eB3BCcbf2017eE7CBfb652eB51CF2E1B153289` | 1,340.00 | 1.00000000 |
| 193 | XOM | ExxonMobil Holdings Corporation | `0xf9B46d3D1B22199D4D1025a9cEDB540A33F1a2d5` | 214.79 | 1.00103956 |
| 194 | ZM | Zoom | `0x44c4F142009036cF477eD2d09932051843137CF1` | 776.01 | 1.00000000 |
| 195 | ZS | Zscaler | `0x7dc013eB55e436f30d7ED1AFE4E36d6e45e3c3f7` | 73.22 | 1.00000000 |

## Appendix B — reproduce the key checks

```bash
RM=https://rpc.mainnet.chain.robinhood.com  RT=https://rpc.testnet.chain.robinhood.com
TM=https://rpc.tempo.xyz                    TT=https://rpc.moderato.tempo.xyz
# LZ pathway support (true,true on mainnet; false,false on testnet)
cast call 0x6f475642a6e85809b1c36fa62763669b1b48dd5b 'isSupportedEid(uint32)(bool)' 30410 --rpc-url $RM
cast call 0x20bb7c2e2f4e5ca2b4c57060d1ae2615245dcc9c 'isSupportedEid(uint32)(bool)' 30416 --rpc-url $TM
cast call 0x3acaaf60502791d199a5a5f0b173d78229ebfe32 'isSupportedEid(uint32)(bool)' 40444 --rpc-url $RT
cast call 0xfb34352ba2e2d9cb93837bb19d36db5d93bcfc41 'isSupportedEid(uint32)(bool)' 40451 --rpc-url $TT
# default ULN config = dead DVN → (5, 1, 0, 0, [0x6788f524…], [])
cast call 0xc39161c743d0307eb9bcc9fef03eeb9dc4802de7 'getUlnConfig(address,uint32)((uint64,uint8,uint8,uint8,address[],address[]))' 0x0000000000000000000000000000000000000000 30410 --rpc-url $RM
# DVN / executor quotes (executor options = workerId 01, len 0011, type 01 lzReceive, uint128 gas)
cast call 0xd01ae6905d48315f7be10c7330aecf8360ef5b12 'getFee(uint32,uint64,address,bytes)(uint256)' 30410 5 0x000000000000000000000000000000000000dEaD 0x --rpc-url $RM   # 26731672336
cast call 0x4208d6e27538189bb48e603d6123a94b8abe0a0b 'getFee(uint32,address,uint256,bytes)(uint256)' 30410 0x000000000000000000000000000000000000dEaD 200 0x010011010000000000000000000000000007a120 --rpc-url $RM  # ~9.17e13
# CCIP lanes (false / 0x0)
cast call 0x06fC836cf9839B1cd891C440A0a45242DA6Ae1c9 'isChainSupported(uint64)(bool)' 7281642695469137430 --rpc-url $RM
cast call 0xa132F089492CcE5f1D79483a9e4552f37266ed01 'getOnRamp(uint64)(address)' 6180753054346818345 --rpc-url $TM
# Precedent: bridge contracts hold ISSUER_ROLE on Tempo TIP-20s (all true)
ISS=$(cast keccak ISSUER_ROLE)
cast call 0x20C000000000000000000000b9537d11c60E8b50 'hasRole(address,bytes32)(bool)' 0x8c76e2F6C5ceDA9AA7772e7efF30280226c44392 $ISS --rpc-url $TM
cast call 0x20c00000000000000000000014f22ca97301eb73 'hasRole(address,bytes32)(bool)' 0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff $ISS --rpc-url $TM
cast call 0x20c000000000000000000000c412ec89d0c08be5 'hasRole(address,bytes32)(bool)' 0x3b54b8c2bcbb673a42c98db9f6ec95128d46c71e $ISS --rpc-url $TM
# Stock token state + ERC-8056 support
cast call 0x322F0929c4625eD5bAd873c95208D54E1c003b2d 'uiMultiplier()(uint256)' --rpc-url $RM
cast call 0x322F0929c4625eD5bAd873c95208D54E1c003b2d 'supportsInterface(bytes4)(bool)' 0x4bd27648 --rpc-url $RM
cast storage 0x322F0929c4625eD5bAd873c95208D54E1c003b2d 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50 --rpc-url $RM  # beacon = registry
# Wormhole executor coverage (68, 72 on mainnet; 68 only on testnet)
curl -s https://executor.labsapis.com/v0/capabilities | jq 'keys'
curl -s https://executor-testnet.labsapis.com/v0/capabilities | jq 'keys'
```
