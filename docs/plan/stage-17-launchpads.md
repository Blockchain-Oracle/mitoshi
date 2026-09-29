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

## Handoff

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
