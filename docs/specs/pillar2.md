<!-- Copied from the approved build plan (v5, 2026-09-29). Change it only through D-entries in docs/plan/decisions.md. -->

## Appendix B — Pillar 2 (stocks on Tempo), themes, launchpads (spec; S0 copies to `docs/specs/pillar2.md`)

**Findings verified this pass (change the brief):** F-A WETH9 placeholder is a chain-bound CREATE (not replayable) and
Moderato already has a UniswapV2Factory at `0xBbBc…` → replay the 7 CREATE2 txs only · F-B replayed PositionManager
differs only in EIP-712 immutables (chain id, domain separator) · F-C a beforeSwap-only hook can't bound post-swap
price (V4Router passes `MIN/MAX_SQRT_PRICE±1`) → flags `0x20C0` · F-D v4-periphery HEAD adds `minHopPriceX36` → pin UR
`0xa2dc` + ABI probe · F-E LZEndpointDollar whitelists pathUSD on both networks; enshrined DEX `MIN_ORDER_AMOUNT` 100e6 ·
F-F TIP-20 `mint` reverts on pause/zero/0x20c0 recipient/TIP-403/supply cap; receive policies redirect (sender = the
minter) → `_credit` pre-checks + try/catch + defers · F-G testnet Stock `oraclePaused()` reverts with empty data →
low-level staticcall + length check; mainnet CRWD `uiMultiplier` 4e18, `effectiveAt` 1782999000 · F-H TIP-1015 allows
compound policies over built-ins → memecoin pre-graduation guard.

Dependencies (S0, pinned): LayerZero `oapp-evm`, `oft-evm`, `oft-evm-upgradeable`, `lz-evm-protocol-v2`,
`lz-evm-messagelib-v2`, `test-devtools-evm-foundry`; OZ 5.x + upgradeable; OZ `uniswap-hooks` 1.2.2 @2ae32be; v4-core
@46c6834 (MIT interfaces/types/libraries only); v4-periphery MIT libraries; `HookMiner` from `v4-hooks-public@e4eabe5`;
tempo-std @b9860ac. Profiles: Tempo default compiles `src/{stocks,themes,launch,common}`; `evm` compiles
`src/{robinhood,transit,common}`.

### B.1 Bridge

**B.1.1 `src/common/`:** `BridgeTypes.sol` (`DeferReason { NONE, INVALID_RECIPIENT, TOKEN_PAUSED, POLICY, SUPPLY_CAP,
RATE_LIMIT, RECEIVE_POLICY, CALL_REVERTED }`); `BridgeRateLimiter.sol` (decaying bucket per eid: `capacity, inFlight,
lastUpdated, window`; `consume` reverts, `tryConsume` for inbound); `StockSyncCodec.sol`:
```
header (23 B): uint8 version=1 | uint32 srcChainId | uint64 srcTimestamp | uint64 seq | uint16 count
0x01 MULTIPLIER (61 B): type | address rhToken | uint128 current | uint128 pending | uint64 effectiveAt
0x02 STATUS     (22 B): type | address rhToken | uint8 flags   (bit0 TOKEN_PAUSED · bit1 REGISTRY_PAUSED · bit2 ORACLE_PAUSED
                                                                 · bit3 ORACLE_SUPPORTED · bit4 LOCKBOX_BLOCKED · bit5 TOKEN_PAUSED_SUPPORTED)
ordering key = (uint128(srcTimestamp) << 64) | seq ; apply iff key > lastKey[mirror][type]; each message is a full snapshot
```

**B.1.2 Robinhood Chain (`evm`):**
- `StockLockbox is OFTAdapter` — **immutable** (no proxy), one per ticker; sharedDecimals 6 (rate 1e12; dust stays with
  the sender). Storage: `guardian` (pause locks, lower limits only), `locksPaused` (never blocks unlocks), `minLockLD`,
  `owed`/`totalOwed` (18 dp), `outstanding[eid]`, `outboundLimit[eid]`, `MIN_UNLOCK_GAS` 120k. `_debit`: not paused, ≥
  min, rate limit, `outstanding += sent`. `_credit`: gas check (retryable) → `outstanding[srcEid] -= amount` (checked
  math: a forged over-release **reverts and stays stuck — intended**) → low-level `transfer`; failure → `owed[to] +=`,
  `UnlockDeferred`. External: `claim()`, `resendOwed(...)`, `setGuardian`, `pauseLocks`, `setRateLimits`,
  `lowerRateLimit`, `reserveView()`. Events `UnlockDeferred`, `OwedClaimed`, `OwedResent`, `LocksPaused`,
  `GuardianSet`, `RateLimitSet`.
- `StockSyncSender is OApp, OAppOptionsType3` — `seq`, `lockboxOf[stock]`, `GAS_BASE` 150k + `GAS_PER_TOKEN` 50k;
  `registerToken`, permissionless `sync(stocks[], dstEid) payable`, `quoteSync`, `readState`. Required reads
  `uiMultiplier`, `newUIMultiplier`, `effectiveAt`; optional reads via staticcall + `ret.length == 32`: `tokenPaused`,
  `oraclePaused`, registry `paused` and `isBlocked(lockbox)` via `ACCESS_CONTROLLED_REGISTRY()`.

**B.1.3 Base Sepolia transit (testnet only):** `TransitOFT is OFT` per ticker (18 dp, shared 6; peers 40451 lockbox,
40444 adapter; supply non-zero only in flight). `HopComposer is ILayerZeroComposer` — `lzCompose` checks endpoint +
transit, decodes `(finalEid, finalTo, minLD)`, allowed final eids {40444, 40451}, `minHopLD`, quotes and `send`s with its
own ETH float (insufficient → revert, compose stays stored, anyone retries after top-up); `receive()`, `withdrawEth`.
`StockSyncForwarder is OApp` — forwards the identical payload to 40444 with its own ETH; underfunded → `pending[guid]`,
`ForwardDeferred`, `retryForward(guid) payable`; never reverts a received sync. Send pattern: `lockbox.send(dstEid
40245, to=HopComposer, composeMsg=abi.encode(40444, tempoRecipient, minLD))` with lzCompose 400k gas; reverse mirrored.

**B.1.4 Tempo (default profile):**
- `TIP20MintBurnAdapter is OFTAdapterUpgradeable` (deployed as `new TransparentUpgradeableProxy(impl, SAFE, initData)`:
  OZ 5.6 requires initialization at construction and creates its own ProxyAdmin owned by the Safe; the implementation
  calls `_disableInitializers()`; Frax **pattern**, not the UNLICENSED file). ERC-7201 storage: `guardian`, `sendsPaused`, `deferred`/`totalDeferred`, `mintedNet`,
  `outboundLimit[eid]`, `inboundLimit`; immutable `lzd = IEndpointV2Alt(endpoint).nativeToken()`. `send` rejects
  `msg.value`. `_debit`: transferFrom → `burn` (TIP-20 burns only the caller's balance). `_credit`: gas ≥ 400k (else
  retryable revert) → `mintBlockReason` in order INVALID_RECIPIENT (0x0, 0x20c0 prefix, ReceivePolicyGuard) ·
  TOKEN_PAUSED · POLICY (`isAuthorizedMintRecipient`) · SUPPLY_CAP · RATE_LIMIT · RECEIVE_POLICY
  (`validateReceivePolicy(mirror, this, to)`) → `try mint` → any failure **defers** (`CreditDeferred`), never reverts.
  `claimDeferred()`, `sendDeferred(...)` (exit that never depends on admin). `_payNative`: pull pathUSD →
  `approve(lzd)` → `lzd.wrap(pathUSD, endpoint, fee)` → return 0. Enforced lzReceive gas ≥ 550k set on senders.
- `StockSyncReceiver is OAppReceiver` (one per network): `TokenSync` in 3 slots, **pre-warmed** with non-zero sentinels
  in `bindToken` (every later sync ~5k/slot); `uiMultiplierOf(mirror)` = pending if `now ≥ effectiveAt` else current;
  `syncOf`, `isSynced(mirror, maxAge)`, `setAutoPause` (Q-010 default false); `_lzReceive` rejects wrong src chain,
  ignores unknown/stale/duplicate records, emits via the view (`notifyUpdated`, `notifyCancelled` when a future pending
  is superseded), optional `try mirror.pause()`. Peers: mainnet 30416 → sender; testnet 40245 → forwarder.
- `ScaledUIView` (one per mirror; the ERC-8056 face): `uiMultiplier`, `newUIMultiplier`, `effectiveAt`, `balanceOfUI`,
  `totalSupplyUI`, `flags`, `supportsInterface` (0x01ffc9a7, 0xa60bf13d, 0x4bd27648, 0xd890fd71 — not 0x57854fc3),
  `UIMultiplierUpdated` / `UIMultiplierUpdateCancelled` events.

**B.1.5 LayerZero configuration (ensure-style `EnsureLzConfig` / read-only `CheckLzConfig`):**

| Network | Endpoint | Send / Receive Uln302 | Executor | Required DVNs (sorted) | Confirmations |
|---|---|---|---|---|---|
| RH mainnet 30416 | `0x6f47…dd5b` | `0xc391…2de7` / `0xe184…1043` | `0x4208…0a0b` | `[0x0ffe02df012299a370d5dd69298a5826eacafdf8 (Nethermind), 0xd01ae6905d48315f7be10c7330aecf8360ef5b12 (LZ Labs)]` | 20 |
| Tempo 30410 | `0x20bb…cc9c` | `0x5728…b73c` / `0x0b6f…71e5` | `0xf851…d7b2` | `[0x0d875bd6c833cedef7fca4fe154d023cdb8eb1cb, 0x76faff60799021b301b45dc1bbede53f261f9961]` | 5 |
| RH testnet 40451 | `0x3aca…fe32` | `0x4584…6160` / `0xd682…ae21` | `0x701f…d243` | `[0xa78a78a13074ed93ad447a26ec57121f29e8fec2]` | 1 |
| Base Sepolia 40245 | `0x6edc…f10f` | `0xc1868e054425d378095a003ecba3823a5d0135c9` / `0x12523de19dc41c91f7d2093e0cfbb76b17012c8d` | `0x8a3d…9d3d` | `[0xe1a12515f9ab2764b887bf60b923ca494ebbb2d6]` | 1 |
| Moderato 40444 | `0xfb34…fc41` | `0x91ec…9ffd` / `0xfebe…1d38` | `0xe665…3687` | `[0x0ac2924460a5b285fd205dedb46738ad46971061]` | 1 |

Steps per OApp × remote eid: pin libraries → `setConfig` executor (type 1) + ULN (type 2) on send and receive libraries
only if different → `setPeer` → `setEnforcedOptions` (lockbox → 30410 SEND lzReceive 550k; → 40245 SEND_AND_CALL 150k +
lzCompose 400k; adapter → RH 150k; transit → 40444 550k, → 40451 150k; sender → receiver 150k base). `CheckLzConfig` fails
on any DeadDVN (`0x6788…e842`, `0x3436…450c`, `0x88b2…e6e0`, `0x236b…72f1`, `0x7855…fa7e`), unsorted arrays or asymmetric
ends. `HandOverToSafe` (mainnet, owner's go). Tempo broadcasts: `--tempo.fee-token 0x20c0…0000` + explicit priority fee.

**B.1.6 Day-1 LayerZero spike (X1):** `src/lz/LzPing.sol` (+ `LzPingTempo` with `_payNative` → LZD) on RH testnet, Base
Sepolia, Moderato; 4 legs; dummy 18-dp ERC-20 → lockbox → transit → composer → a Moderato "DUMMY" TIP-20; record compose
native value (from RH and from Moderato), `quoteSend` units, fresh-address mint gas, latency, treasury fee. Fallback:
composer self-funding (already designed).

### B.2 Mirror issuance (`script/stocks/IssueMirrors.s.sol`)

`salt = keccak256("cwf.mirror.v1:" ‖ TICKER)`; `TIP20_FACTORY.createToken(name "Bridged TSLA Stock Token (unofficial)",
symbol "bTSLA", currency "TSLA", quote pathUSD, admin deployer, salt, logoURI own lettermark)` (no Robinhood marks;
Q-023); assert currency/quote/decimals 6/policy 1; `ISSUER_ROLE` → adapter proxy only; `PAUSE_ROLE`, `UNPAUSE_ROLE`,
`BURN_BLOCKED_ROLE` → Safe; `setSupplyCap` (testnet 1,000 tokens; mainnet 1.25 × planned locked; mints beyond defer);
admin → Safe, deployer renounces. Transfer policy stays 1; any blacklist never lists PoolManager/PositionManager/UR/
ThemeRouter/adapter/LiquidityLocker. reserve-watch alerts on any non-adapter ISSUER grant.

### B.3 Uniswap v4

**B.3.1 Moderato replay** (Arachnid `0x4e59b44847b379578588920cA78FbF26c0B4956C`, calldata = `salt ‖ initcode+args`):

| # | Contract → address | Mainnet creation tx (block) |
|---|---|---|
| 1 | PoolManager `0x33620f62c5b9b2086dd6b62f4a297a9f30347029` | `0x0eeeeb32101a5bee087e55bc6a699aa4ec2f4e749f93c224f95b42fccce52205` (6,455,926) |
| 2 | PositionDescriptor impl `0x269ac84585a8c1012ad913573adf8a6c9df48897` | `0x4b623d4e065f5cec00a428a654861b24b0b1832ebafd6687b05182304ef7f7d0` (6,458,512) |
| 3 | TransparentUpgradeableProxy `0xc73ed2cba8c347593d1d9120aa0be8ff88c6ff77` | `0x42741eb36ff996f494a0a2dab26036d324068c1a06e5b3083a664350a53ee41f` (6,458,515) |
| 4 | PositionManager `0x3fc79444f8eacc1894775493ff3fa41f1e35ce11` | `0xbb2ee84a2edbf378d31712240d25816cbbc69ef6792be199c4c6877ad861a53e` (6,458,520) |
| 5 | V4Quoter `0x20e6487c371a2086f841ef453f85378223df4f4e` | `0xf53d1572806c1416a6090f0c993b0b9970b54c16916d4759632b8ebe620bb61a` (6,458,523) |
| 6 | StateView `0x21b954fba3f5ddebe77ef2d47a3100c066908b2a` | `0x4f0c36c0c63a2bfb4b87e101a5f65dfa266e772b7a8f1092d6b3eb9b7de95ee3` (6,458,526) |
| 7 | UniversalRouter (pinned) `0xa2dc7d0266f0cc50b3eeaf36c9bfcecff1beea91` | `0x1332bf9fe185668b065afb129c62c93ca4a95c4888ea6630d7e97925fc2bb7cd` (6,458,542) |

Procedure (`scripts/v4/replay-moderato.ts`, root key — access keys can't CREATE): fetch `cast tx $HASH input` on mainnet,
check `to == Arachnid`, split salt/initcode, `cast create2` must print the expected address, send only if no code on
Moderato (`--gas-limit 29500000 --tempo.fee-token pathUSD --priority-gas-price 1`), one per block, in order.
Verification (`verify-replay.ts`): code hashes equal for rows 1–3, 5–7; row 4 may differ only in words equal to
4217→42431 or the two `DOMAIN_SEPARATOR()`s; immutables read back; writes `deployments/42431/v4.json`. Mainnet config
`packages/clients/src/addresses/v4.ts` (official addresses, UR `0xa2dc`, aggregator hook `0x7169…6888` from pool
`0x00cdb9b1…`'s Initialize log; mainnet only). UR ABI probe (X3) on a mainnet fork decides the encoder.

**B.3.2 `StockReference`** (`src/stocks/StockReference.sol`): `Ref {priceE18 (underlying USD per share), observedAt,
writtenAt, source (KEEPER/REDSTONE/DATASTREAMS), halted}` per mirror; `SessionState`; `pushDataStreams(reports[])`
(permissionless, v11 mid, `observedAt = observationsTimestamp`), `pushRedStone(mirrors[])` (permissionless, S2 verifier
`verifySpot`), `pushKeeper` (KEEPER_ROLE, labelled), `setSession`, `setHalted`, `currentSession()` (keeper flag if
fresh, else DS `marketStatus` < 120 s, else UNKNOWN), `read(mirror)`. Accept only newer `observedAt`, ≤ 60 s future,
price > 0. Moderato: RedStone for TSLA/AMZN/PLTR/AMD; NFLX honestly paused (Q-011). Mainnet: Data Streams + RedStone.

**B.3.3 `StockGuardHook`** (OZ `BaseHook`, flags `0x20C0`) + `GuardMath`. With pathUSD = currency0 and mirror =
currency1: `tokenPriceE18 = sharePriceE18 × uiMultiplierE18 / 1e18`; v4 price = 1e18 / tokenPrice; `sqrtPriceX96 =
sqrt(mulDiv(1<<192, 1e18, tokenPriceE18))`; band: `sqrtLo = sqrtFromToken(P·(1+b))`, `sqrtHi = sqrtFromToken(P·(1−b))`.
`Guard {mirror, bandRegularBps, bandExtendedBps, bandClosedBps, maxAgeRegular, maxAgeClosed, caWindow, maxSyncAge,
offHoursMode, requireVerified, registered}`; `registerPool` (currency0 pathUSD, currency1 mirror, static fee), `setGuard`
(bands ≤ 2,000 bps; can't unregister). `_beforeInitialize`: registered, initial price within the closed band.
`_beforeSwap`: not halted · multiplier synced · not issuer-paused · not oracle-paused · outside the corporate-action
window · session → band and max age (REGULAR / extended / CLOSED: REFUSE or WIDEN) · reference fresh · `requireVerified`
⇒ RedStone/DS · tstore (lo, hi, pre). `_afterSwap`: post-swap sqrt within [lo, hi], or strictly closer to the band from
outside without overshoot (corrective arbitrage never deadlocked), else `OutOfBand`. Defaults (Q-024): 150/300/500 bps,
`maxAgeRegular` 120 s, `maxAgeClosed` 345,600 s, `caWindow` 900 s, `maxSyncAge` 26 h, WIDEN. No liquidity hooks (exits
always open). Deploy: HookMiner (reject `0x91` prefix) + Arachnid.

**B.3.4 Pools and house plan:** `PoolKey {pathUSD, mirror, fee 3000, tickSpacing 60, StockGuardHook}`;
`scripts/v4/create-stock-pools.ts`: `registerPool`, then one house batch `[approvals to Permit2, Permit2.approve ×2 to
PositionManager, PositionManager.multicall([initializePool(key, sqrtP_ref), modifyLiquidities(MINT_POSITION × k +
SETTLE_PAIR)])]`, ticks from USD bands rounded to 60, liquidity via a TS `LiquidityAmounts` port. Moderato inventory from
daily faucet claims (after ~8 days: keep 5 per ticker for bridge demos, seed 30 per ticker ≈ $10.9k TSLA), equal pathUSD,
80 % ±12 % concentrated + 20 % full range, a $20k pathUSD bid ladder over [−15 %, −1 %], daily `topup.ts`. NFLX pool
small, guard-refused, UI says why. Mainnet sized by Q-008 budget.

### B.4 Themes

**B.4.1 `ThemeRegistry`:** `Theme {creator, createdAt, version, creatorFeeBps (≤ 50), maxSlippageBps, minIntervalSec,
maxRefAgeSec, tokenCount (≤ 16), sessionsMask, delisted, erc8004AgentId, specHash, specURI}`; per-version token list and
`Band {min, max, target, allowed}` + cash band; tokens allowed only with a registered guarded `(pathUSD, token)` pool;
`publish`, `publishVersion` (followers re-consent), `setAgent`, `delist` (Safe; visibility only). Spec JSON
canonicalised with RFC 8785 JCS; `specHash = keccak256`; on-chain fields must equal the spec.

**B.4.2 `ThemeRouter`** (`IUnlockCallback`, no custody): `FollowCaps {expiry, allocationUsd, maxTradeUsd, maxDailyUsd,
maxSlippageBps, maxFeeBps, minIntervalSec}`; `Follow` in 4 slots (never zeroed; re-follow ~5k/slot); `Trade {tokenIn,
tokenOut, amountIn, minAmountOut}` (one side pathUSD). `follow(themeId, version, caps, keyId)` — root only
(`getTransactionKey() == 0`); key exists, not revoked, expiry ≥ caps; `getAllowedCalls` scoped and only
{`rebalance`, `approve@router` for theme tokens incl. pathUSD}. `rebalance(themeId, trades, priceProof, decisionId)`:
key == follow key (root skips caps, not theme checks) · active · not expired · version matches · min interval · tokens
allowed · optional proof push to `StockReference` · ref age ≤ theme max · session allowed · `unlock` legs with extreme
limits · `amountOut ≥ minAmountOut` · execution price within min(theme, follow) slippage of `P_i = share × m` · per-leg
and daily notional caps · envelope assert (bought weight ≤ max × allocation × 1.02) · settlement takes before settles,
each take pre-checked with `validateReceivePolicy(token, poolManager, follower)`, settles per currency by
`PM.sync(c)` → `transferFrom(follower, PM)` → `PM.settle()` · fee `transferFrom(follower, router)` into `feesOwed[creator]` · `Rebalanced`. `claimFees`, `updateCaps`,
`unfollow` (root only). Invariants: router pathUSD == `totalFeesOwed`, other balances 0; transfers only to the follower;
allowances 0 after exact approvals; daily cap; version consent.

**B.4.3 Follow flow:** `POST /api/themes/:id/agent-key` → ops creates a secp256k1 key per (follower, theme) and returns
`keyId`; one root-signed tx `key_authorization + follow(...)`, relay-paid:
```ts
{ address: keyId, keyType: 'secp256k1', expiry: now + 30*86400,
  limits: [ { token: PATH_USD, limit: caps.maxDailyUsd + feeHeadroom, period: 86400 },
            ...themeTokens.map(t => ({ token: t, limit: ceil(caps.maxDailyUsd / P_t * 1.2), period: 86400 })) ],
  scopes: [ { address: THEME_ROUTER, selector: 'rebalance(uint64,(address,address,uint128,uint128)[],bytes,bytes32)' },
            { address: PATH_USD, selector: 'approve(address,uint256)', recipients: [THEME_ROUTER] },
            ...themeTokens.map(t => ({ address: t, selector: 'approve(address,uint256)', recipients: [THEME_ROUTER] })) ] }
// never allowAnyCalls; no transfer selector; enforceLimits = true
```
X4 measures the 5-token authorization (~15–16M + ~1.2M for `follow` by formula — likely over 16M); split: tx 1 = key
authorization {all limits; router + pathUSD approve scopes} + `follow`, tx 2+ = `setAllowedCalls` chunks ≤ 5 targets.
Custody: testnet AES-256-GCM with a Fly-secret master key in `theme_agent_keys`; mainnet envelope-encrypted with KMS;
revocation = user `revokeKey` then delete.

**B.4.4 Theme agent / rebalancer** (`services/ops/src/actors/theme-agent/`): tick 60 s in REGULAR, 15 min otherwise;
proof (RedStone on Moderato, Data Streams on mainnet); skip on unsynced/paused/oracle-paused/corporate-action window;
decision via `packages/brain` with an MPP charge-intent payment, stored `(decision_id, theme_id, weights,
rationale_hash, mpp_payment_tx)` **before sending** ("unpaid" label without Q-020); per follower: raw balances, UI
amount = raw × m, NAV, drift vs `driftBandBps`, planner (sell overweight first, min trade $5, caps, key's remaining
limit), V4Quoter per leg, batch `[approvals exact, router.rebalance]` keychain-signed with the follower's key, expiring
nonce (`valid_before = now + 120`), relay fee payer, one sponsored tx per follower; reconcile unknowns without
re-signing; ERC-8004 agent registered; followers post feedback.

### B.5 Launchpads

**B.5.1 Stablecoin (one creator batch; address predicted by `getTokenAddress(creator, salt)`):**
```
1 TIP20_FACTORY.createToken(name, symbol, "USD", pathUSD, admin=creator, salt, logoURI)
2 token.grantRole(ISSUER_ROLE, creator)      3 token.setSupplyCap(cap) (optional)      4 token.mint(creator, initialSupply)
5 STABLECOIN_DEX.createPair(token)
6 STABLECOIN_DEX.placeFlip(token, bid ≥ 100e6, true, -10, 10)     7 placeFlip(token, ask ≥ 100e6, false, 10, -10)
8 FEE_MANAGER.mint(token, pathUSD, feeLiquidity, creator)          9 LaunchRegistry.recordStablecoin(token, metadataURI)
```
Implicit approvals (no `approve` calls); ≈ 7.5–8.5M gas, one tx; optional blacklist policy as separate txs (runbook
forbids listing the DEX/FeeManager); currency locked to "USD" with a typed confirmation; registry refuses non-USD.
`LaunchRegistry`: `launchOf`, `tokens[]`, `recordStablecoin` (isTIP20, caller holds admin, currency USD, quote pathUSD),
`recordMemecoin` (only CurveLaunchpad), `isReservedCode` (ISO-4217 fiat + the 195 Stock Token tickers + "USD").

**B.5.2 Memecoin — `CurveLaunchpad`** (singleton; graduation in delegatecalled `CurveGraduationLib`): `Segment
{sqrtPriceUpperX96, liquidity}` (curve frame: token0 = coin, token1 = pathUSD); `FeeSchedule {base, start, period,
reduction, mode}` (anti-snipe); `LpSplit` (6 buckets, Σ 10,000, Σ locked ≥ 1,000); `Config {partner, fee shares, fee
schedule, sqrtStart, segmentCount, migrationQuoteThreshold, sqrtEnd, curveSupply, migrationCoinAmount, totalSupply,
migrationFeeBps, split, vestingCliff, vestingDuration (≤ 63,072,000 s), leftoverReceiver, poolFees[3], tickSpacings[3],
maxCreatorBuyBps}`; `Launch {token, configId, state (Trading/Complete/Graduated), createdAt, segment, sqrtPriceX96,
quoteReserve, coinSold, creator}`; `feesOwed`; immutable `curvePolicyId` = compound `(1, blacklist{PoolManager}, 1)`.
`createConfig` (1–16 increasing segments), `createLaunch` (currency = symbol, reserved codes refused, launchpad is admin
+ issuer, policy → curve policy, supply cap = total, registry record, optional creator buy), `buy` (mint to buyer; clips
at `sqrtEnd`), `sell` (transferFrom → burn), `graduate` (permissionless when Complete), `claimFees`, quotes. Maths:
`SqrtPriceMath` over piecewise-constant liquidity, rounding favours the reserve, pathUSD fees split protocol/partner/
creator, receive-policy pre-checks on every payout.
**Graduation (≈ 5–7M gas):** state guard → 0.2 % protocol + `migrationFeeBps` → policy → 1 → mint `migrationCoinAmount` →
target `sqrtPriceX96_v4 = 2^192 / launch.sqrtPriceX96` (frame flip) → if the pool already exists, corrective swap
toward target (≤ 10 % of migration coin; backup tiers 1–2; else `PoolPoisoned`) → Permit2 approvals → `PositionManager.
multicall([initializePool, modifyLiquidities(full-range MINT_POSITION to LiquidityLocker, SETTLE_PAIR)])` →
`locker.register` → leftover claim → renounce ISSUER + admin → `Graduated`.
**`LiquidityLocker`:** one NFT per coin, buckets locked/vesting/unlocked per partner and creator, fee accumulation
(`DECREASE_LIQUIDITY(0)` + `TAKE_PAIR`), `withdraw` per bucket (locked never; vesting linear after cliff).
Gas: `createConfig` 5–6M, `createLaunch` 4.7M, `buy` 120–420k, `sell` 100–150k, `graduate` 5–7M, locker claim 200–350k.

### B.6 Tests (file :: names)

- Bridge (`evm`, TestHelperOz5 + our MIT `MockStockToken`): `StockLockbox.t.sol` (lock, dust, paused, rate limit,
  unlock, defer on paused/blocked, revert beyond outstanding, low gas retryable, claim, resendOwed, pause never blocks
  unlock, guardian only lowers); `StockSyncSender.t.sol`; `StockSyncCodec.t.sol` (fuzz roundtrip, truncated, unknown
  type, ordering); `HopComposer.t.sol`; `StockSyncForwarder.t.sol`.
- Tempo: `TIP20MintBurnAdapter.t.sol` (mint; defer × 6 reasons; try/catch defer; low gas; claim after cap raise;
  sendDeferred; send burns; LZD via pathUSD; rejects value; upgrade only ProxyAdmin); `StockSyncReceiver.t.sol` (newer,
  stale/duplicate, CRWD resend no event, superseded pending, switch at effectiveAt, unknown token, wrong chain,
  pre-warmed gas < 60k, auto-pause never reverts); `ScaledUIView.t.sol`; `IssueMirrors.t.sol`.
- Invariants: `BridgeInvariant.t.sol::invariant_lockedEqualsSupplyPlusInFlight` (`stock.balanceOf(lockbox) ==
  (supply + totalDeferred + in flight)·1e12 + totalOwed`), `invariant_outstandingBoundsUnlocks`,
  `invariant_noUnbackedMint`; `BridgeHopInvariant.t.sol`.
- v4 + hook: `GuardMath.t.sol` (sqrt roundtrip fuzz, band orientation, **multiplier × not ÷**, CRWD vectors);
  `StockGuardHook.t.sol` (PoolManager runtime fixture + `PoolSwapTest`: bits 0x20C0, init rules, in band, out of band,
  corrective swap, overshoot, stale reference, closed refuse/widen, extended, issuer/oracle paused, CA window, unsynced,
  remove liquidity never blocked, quoter out of band, multiplier 4); `StockReference.t.sol` (SPY v11 fork, status map,
  RedStone archive fixture, keeper labelled, session expiry, older ignored).
- Forks: RH testnet Stock Token; RH mainnet CRWD multiplier; Base hop; Moderato adapter; `ReplayParity`, `UrAbiProbe`,
  `StockPoolLive`, `GraduationLive`; Tempo mainnet read-only config.
- Themes: `ThemeRegistry.t.sol`; `ThemeRouter.t.sol` (root-only follow, unscoped key refused, wrong key, expired,
  allowlist, caps, daily reset, interval, slippage, outputs to caller, receive-policy blocked, exact approvals consumed,
  version mismatch, fees, unfollow, root self-rebalance); `invariant_routerHoldsOnlyOwedFees`. Key-signed flows run on
  `anvil --tempo` / Moderato (tempo-std has no keychain-signature builder).
- Launch: `CurveMath.t.sol` (vectors shared with `packages/core/src/launch/curve.vectors.json`, buy-sell no-profit fuzz,
  segment crossing, threshold clip); `CurveLaunchpad.t.sol` (config validation, currency guard, anti-snipe, pre-checks,
  graduate incl. poisoned pool + backup tier, policy flip, roles renounced, leftover, fees); `LiquidityLocker.t.sol`;
  `StablecoinBatch.t.sol`; `CurveInvariant.t.sol` (reserve vs integral, supply == sold, balance covers reserves + fees).
- Drives: `scripts/drive/{bridge-testnet,stocks-trade,themes,launch-stablecoin,launch-meme}.ts`.

---
