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

_None yet._

## Handoff

_Not started._
