# S17 — Launchpads (17a wave 1, web after S1; 17b after S15a, keeper after S3; App. B.5)

- [ ] 17a `src/launch/LaunchRegistry.sol` + `test/launch/StablecoinBatch.t.sol`; `packages/markets/src/launch/
  stablecoin.ts` (9-call batch, address prediction); `packages/core/src/launch/currencyGuard.ts`; `/launch/stablecoin`
  wizard (21st 23576; typed confirm on 25081 v-form-12): review step restating "This cannot be changed later", typed confirmation of the code, a live
  preview of how wallets show it, per-call progress from the batch receipt; a first-use explainer on the first launch; `relay/policies/launch.ts`; spike X22. Sub-gate: a stablecoin created on Moderato in one tx; pair + flip orders visible;
  FeeAMM reserves > 0; a tx paying fees in the new coin.
- [ ] 17b spike X5; `src/launch/{CurveMath,CurveLaunchpad,CurveGraduationLib,LiquidityLocker}.sol` + unit/invariant/
  fork tests; `packages/core/src/launch/curve.ts` + vectors; launch-keeper; `/launch` list (22252 rows + 23549 progress + 30538 sparkline; logo dropzone 377
  use-image-upload); `/launch/meme`, `/launch/[token]`: live
  curve (30538) with your position and progress to graduation (23549), buy/sell with optimistic balance, the anti-snipe
  fee schedule shown before buying, the graduation state machine (Complete → graduating → trading on Uniswap, link, push
  to holders), safety labels (unaudited, creator powers, locker/vesting) and report/block (D34); token page composed
  (weak coverage, E.4).
- **Gate:** create → buys → Complete → keeper `graduate` → hookless v4 pool swaps via UR; locker claims; route budget on `/launch/[token]`; poisoned-pool
  fork test passes; UX gate on every launch route. **Rows:** LP-01…LP-09.

## Findings

- **S17a-F1 (X22, D-063)** `TIP20_FACTORY.createToken` is a precompile call, not CREATE: an access key created a token
  and signed the full 9-call stablecoin batch on Moderato. Launches need no root-only path.
- **S17a-F2** A DEX bid's `amount` is in base units; it escrows `ceil(amount × (100000 + tick) / 100000)` pathUSD
  (100 tokens at tick −10 = 99.99 pathUSD). B.5.1's "bid ≥ 100e6" is the base-unit minimum (`MIN_ORDER_AMOUNT`).
- **S17a-F3** The batch measured **9.23M gas** on Moderato (B.5.1 estimated 7.5–8.5M): under the 16M guidance.
- **S17a-F4** A single-sided first FeeAMM `mint` (validator token pathUSD only) works; the new coin pays fees in the very
  next tx (reserveUser 0 → 52). No `approve` calls anywhere: the DEX and FeeAMM pull via implicit approvals.
- **S17a-F5** The factory accepts any currency string (e.g. "TSLA" quoted in pathUSD), so the registry/launchpad guard
  is the only thing stopping a memecoin from squatting a fiat code or a stock ticker.
- **S17a-F6** The relay can't sponsor the batch (8-call cap, one area per tx, capital intake) — the creator self-pays
  in pathUSD (D-063). `launch.ts` sponsors nothing in 17a and refuses `recordStablecoin`/`recordMemecoin`.
- **S17a-F7** Forge's local Tempo EVM credits the test contract with genesis pathUSD; `deal` cannot write TIP-20
  balances (precompile storage), so tests fund actors by transfer.

- **S17b-F1 (X5, D-095)** Compound TIP-403 `(1, blacklist{PoolManager}, …)` keeps a coin out of the PoolManager —
  `transfer`, `transferFrom` and v4 `sync → transfer → settle` all revert `PolicyForbids` — while mints to buyers,
  transfers into the launchpad, payouts and issuer burns work (local EVM + live `eth_call` on Moderato).
- **S17b-F2** The spec's `(1, bl, 1)` lets a **mint** land in the PoolManager; the curve policy is `(1, bl, bl)`.
- **S17b-F3** Before graduation a squatter can only initialise the pool and park **pathUSD above its price**
  (coin-side liquidity needs coin in the PoolManager). Correcting upward sells coin into that pathUSD (the squatter
  buys at worse than the curve's price); correcting downward crosses no liquidity. Live: 50 pathUSD squatted →
  49.499999 recovered by the correction (1 % pool fee), graduation on the same tier.
- **S17b-F4** Measured gas (Moderato receipts) vs B.5.2: `createConfig` 4.36M (5–6M est.), `createLaunch` + creator
  buy 6.98M (4.7M est.: `createToken` alone is 2.3M), `buy`/`sell` 140k, completing buy 147–392k, `graduate` 6.20M
  with a correction (5–7M est.), UR swap 413k (first holding), locker `claimFees` 407k and `withdraw` 459k (200–350k
  est.: each is a PositionManager unlock plus TIP-20 transfers), `claimFees` 55k, `claimLeftover` 66k.
- **S17b-F5** A holding worth nothing after the fee can't be sold (`Slippage(0, 0)`, < 2 coins at the start price):
  the invariant's sell-everyone check allows exactly that dust.
- **S17b-F6** Etching the PositionManager runtime skips its constructor: slots 0/1 (ERC-721 name/symbol) and 8
  (`nextTokenId` = 1) are set by `PositionManagerFixture` (read from Moderato).
- **S17b-F7** Sourcify gives the linked `CurveLaunchpad` `match` (runtime + creation), the others `exact_match`.
- **S17b-F8** `LaunchRegistry.setCurveLaunchpad` needs the S17a registry's owner (the shared `deployer` key), so the
  launchpad ships with registry v2 owned by the lane key (D-096).

## Handoff

- S13 hand-off (2026-10-11): `/launch/[token]` carries Report — `/api/social/report` already accepts `targetKind: "token"` (D34); the page adds the button (`features/social/report-dialog-lazy.ts`) and runs the token's name and description through the word filter (`server/word-filter.ts`).

**17a — contracts, batch, guard, policy and sub-gate done; the `/launch/stablecoin` wizard waits for S1's shell.**
Done (branch `stage/S17a-launch`): `src/launch/{LaunchRegistry,ReservedCodes}.sol` (deployed + Sourcify-verified on
Moderato `0x9b664B9B73497Aa140EdA23a81fCC3db279c50b7`, fragment `deployments/42431/launch.json`),
`test/tempo/launch/{StablecoinBatch,LaunchRegistry}.t.sol`, `packages/markets/src/launch/stablecoin.ts`
(`@cwf/markets/launch`: 9-call batch, address prediction, receipt → per-call progress, on-chain read-back),
`packages/core/src/launch/currencyGuard.ts` (+ `reserved-codes.json`, generated with the Solidity table by
`scripts/launch/reserved-codes.ts` from the SIX ISO 4217 list and the 195 Robinhood tickers),
`packages/markets/src/relay/policies/launch.ts`, `scripts/drive/launch-stablecoin.ts`, spike X22 (answer in D-063).
Sub-gate evidence: `acceptance/S17.md` (one-tx stablecoin, pair + flip orders, FeeAMM reserves, fee paid in the coin).

Remaining for 17a (sequenced, not cut):
1. `/launch/stablecoin` wizard on S1's shell (21st 23576; typed confirm on 25081 v-form-12): review step restating "This
   cannot be changed later", typed confirmation via `typedConfirmationMatches`, live wallet preview, per-call progress
   from `readStablecoinReceipt`, first-launch explainer. Build the batch with `buildStablecoinBatch`, send self-paid
   (not sponsored) with `feeToken = pathUSD`; validate with `validateStablecoinLaunch` before signing.
2. When S1's relay lands on the trunk: type `launchPolicy` as `RelayPolicy` (`relay/types.ts`) and add it to
   `policies/index.ts` `POLICIES`.
3. Then tick the 17a box. 17b (curve launchpad) calls `LaunchRegistry.setCurveLaunchpad` once and adds its entry points
   to `launch.ts`. Consider `reserveCodes` for our mirror symbols (`bTSLA`…, Q-023) once S14c fixes the naming.

**17b — contracts, maths, keeper, data layer and the live gate path done; the three launch routes wait for S1's
shell.** Branch `stage/S17b-meme`. Deployed + Sourcify-verified on Moderato (fragment `deployments/42431/launch.json`,
D-096): CurveLaunchpad `0x77440B9970E470665a16bEAE610Ffdb9bBcc6c76`, LiquidityLocker
`0xf60F444952aE9573827Ef6aCE9601F18784206AA`, LaunchRegistry v2 `0x82480CCE69a9a85D0c8515C5b2ddDED6e0Ea94A3`,
CurveGraduationLib `0x280e…346e`, CurveConfigLib `0xf35d…eb55`; owner/treasury = `deployer-launch`. Template
configId 1 is live (the drive's: $0.000001 → $0.000015, 5,000 pathUSD, anti-snipe 50 % → 1 % over 100 s).

Code: `contracts/src/launch/{CurveTypes,CurveMath,CurveConfigLib,CurveGraduationLib,CurveLaunchpad,LiquidityLocker}.sol`,
`interfaces/ILaunchDeps.sol`; tests `test/tempo/launch/{CurveMath,CurveLaunchpad,CurveGraduation,LiquidityLocker,
CurveInvariant}.t.sol` (+ `LaunchBase.sol`, `test/lib/PositionManagerFixture.sol`), `test/spikes/X5CompoundPolicy.t.sol`,
`test/fork/v4/CurveGraduation.fork.t.sol`; `packages/core/src/launch/{curve,curveVectors}.ts` + `curve.vectors.json`
(regenerate: `tsx scripts/launch/curve-vectors.ts`); `@cwf/markets/launch` = `stablecoin.ts` + `meme.ts` (calls) +
`memeRead.ts` (reads); `services/ops/src/actors/launch-keeper/`; `relay/policies/launch.ts`;
`script/launch/DeployCurveLaunchpad.s.sol`; `scripts/drive/launch-meme.ts`. Evidence: `acceptance/S17.md` (S17b rows).

Remaining for 17b (sequenced, not cut):
1. **UI on S1's shell.** `/launch` list (21st 22252 rows + 23549 progress + 30538 sparkline): `listMemecoins` →
   `readMemeLaunch` per row (`progressBps`, `priceE18`, `stage`), sparkline from `readMemeTrades`. `/launch/meme`
   (create; logo dropzone 377 use-image-upload): a template picker over `getConfig`, `checkMemecoinCurrency` live,
   `buildCreateLaunch` (predicted address shown before signing; optional creator buy ≤ `maxCreatorBuyBps`).
   `/launch/[token]`: live curve (30538) from `curveShape` + `readMemeTrades`, "your position" `readMemePosition`,
   progress (23549) `progressBps`; buy/sell via `quoteMemeBuy`/`quoteMemeSell` (local, equal to the contract views)
   → `buildBuy`/`buildSell` with `withSlippage`, optimistic balance from the quote; the anti-snipe schedule
   `feeTimeline(config.fees)` and `feeBpsNow` shown before buying; the graduation state machine from `stage`
   (trading → complete = "graduating, the keeper is on it" → graduated: `pool.id`, swap via `buildPoolSwap`, push to
   holders), safety labels (unaudited; creator has no token powers — the launchpad is admin until graduation, then
   nobody; locker buckets `lockOf`/`withdrawable`, vesting cliff/duration), locker/claims panels
   (`readMemeClaims`, `buildLockerWithdraw`, `buildLockerClaimFees`, `buildClaimFees`, `buildClaimLeftover`), report/
   block (D34); token page composed (weak coverage, E.4); route budget on `/launch/[token]`; UX gate on every launch
   route. Decode tx outcomes with `readMemeReceipt`.
2. **Relay.** When S1's relay lands: type `launchPolicy` as `RelayPolicy`, add it to `policies/index.ts`, and confirm
   the relay accepts the exact `approve` call in front of `buy`/`sell`/`createLaunch` (pathUSD / the coin are not
   launch-area targets).
3. **Keeper.** When S1's `tx/send.ts` is on the trunk, wire `sendBatch` as the keeper's `GraduateSender` in `main.ts`
   (D-098) with a funded keeper key (`LAUNCH_KEEPER_ADDRESS` + its key), then the S3 lane adds `launch-keeper` to the
   testnet `OPS_ACTORS` with `DRY_RUN=0`.
4. **Holders/trades at scale** (LP-08 "I"): `readMemeTrades` reads logs directly; move to the S3.5 indexer when it
   lands.
5. Then tick the 17b box. Mainnet deployment waits for the owner's go (Q-018 defaults applied: 10 % locked floor,
   ≤ 2 y vesting, 0.2 % + migration fee).
