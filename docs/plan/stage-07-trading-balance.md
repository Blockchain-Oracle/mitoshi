# S7 — Trading Balance: EventVault + tap trading (after S4; contracts A.4.1, web C)

- [x] Contracts: `src/products/shared/{EngineSeam,Payouts}.sol`; `src/products/vault/{IEventVault,VenueGateway,
  EventVault,VaultTally}.sol` (forwarder removed; D-062; D-091 `Caps.market`; P12 on withdraw; crank opt-out;
  `sweep(bytes32)`); tests that prove it: Masayume's `EventVault.funding`, `.trading`, `CapsVectors`, plus
  `test_D062_churnDoesNotLeakOpenPositions`, `test_D091_grantMarketScope`, `test_engineAccountingMismatch`,
  `test_withdraw_receivePolicyBlocked`, `test_msgSenderIsOwner_noForwarder`, `test_sessionKeyTapFlow`,
  `invariant_vaultPositionsMatchEngine`, `invariant_vaultWalletConservation`; `script/DeployEventVault.s.sol`.
- [ ] Off-chain: `packages/markets/src/vault/*`; `relay/policies/vault.ts` (sponsor: placeFor, withdraw,
  withdrawPrivate, revoke, crankSettle, sweep; never: deposit, depositAndGrant, grant, fundGrant — unchanged from Masayume;
  Q-021 for `place`/`moveToPrivate`); `sessions/session-key.ts` (WebCrypto P-256 account); port Masayume
  `web/src/features/{vault,session}/*` with the E.5 S7 fixes: the arm modal stays one sentence + one button (centred);
  the fallback reason always rendered on the CTA ("Budget used — add 25"); a persistent allowance pill ("Tap-trading ·
  18/25 left · 6 h") with warn-before-expiry, one-tap renew, "Add to budget", "Extend"; "Spent today" updates
  optimistically; memoised split context (no 1 s
  re-render); partial withdraw with Max and inline reasons (Agari `AmountField`); the D37 onboarding slot offers the Trading Balance
  arm (centred, one sentence); settler crank; `idx_vault_*`.
  21st starts: segmented control 23552 for caps presets, hold-to-confirm 23527 for revoke-all.
- **Gate:** passkey root deposits + grants (self-paid), session-key taps sponsored with no prompt, a cap refusal shown
  with its reason (never a surprise prompt), renew/extend, revoke, partial withdraw, killed-tab recovery by
  `validBefore`; the key appears in `/settings/account` (D44). **Rows:** L-08, L-27, L-28, Y-16, UX-01 (Trading Balance
  arm), UX-06.

## Findings

- **F-S7-01 (S7.1, seam shape).** `EngineSeam` is an internal library over `(engine, lens, collateral)`;
  `placeMeasured` also requires nothing rested and the product's engine credit and escrow unchanged, so a lie in any
  `PlaceResult` field that moves money is caught. `Payouts.sol` = `PayoutCheck` (refuse; for a receiver's own call) +
  `Payouts` (owe + `claimOwed`; for payouts a third party triggers). D-110.
- **F-S7-02 (S7.2, port).** EventVault is Masayume's line for line except the A.4.1 edits (D-003, D-111): no
  forwarder, the engine seam, D-062, D-091, P12 on withdrawals (refuse, D-112). Runtime **18,204 B** (Masayume's
  via-IR build 14.0 KB; the measured seam adds ≈ 4 KB), well under 23.5 KB. Files ≤ 400 lines (EventVault 384).
- **F-S7-03 (S7.3, real engine).** Masayume's `MockVenue` filled YES at 0.60 **and** NO at 0.40 at once — a crossed
  book a real engine cannot hold. `BookSeeder` rests the side each order takes just before it, so every expected
  number in the ported suites and the golden caps vectors is unchanged (D-113). Rows #2 (refund as pool credit) and
  #10 (fees) have no engine counterpart; their tests assert the engine's behaviour instead (exact pull, no credit, no fee).
- **F-S7-04 (S7.3, D-062 reach).** With `_bookSale` releasing at zero, a tag can no longer outlive its tokens through
  any vault path; `crankSettle`'s release branch is defence in depth and its test forges the state Masayume could
  reach. The churn test shows the real leak closed: cap 1, buy → sell to zero → buy the other side succeeds.
- **F-S7-04b (S7.3, invariants).** The op-mix handler (as S2's) drives ≈ 60 real engine fills per 250-step run
  (256 runs); `afterInvariant` settles one Window Up and voids the other, cranks every owner, revokes every grant and
  withdraws everything: the vault ends holding exactly zero in the engine and in its wallet, every run.
- **F-S7-05 (S7.4, Moderato fork).** Forge's default CREATE address on a Moderato fork already holds 1e12 pathUSD: a
  real "donation" the vault's accounting never reads (the fork test asserts it comes out untouched).
- **F-S7-06 (S7.4, deploy).** `DeployEventVault` reads the engine and lens from `deployments/<chainId>/engine.json`,
  deploys (20,055,924 gas; 1,000 gas/B code) and re-checks the crank opt-out and the engine allowance. Sourcify exact
  match. The `evm` profile skips `test/products/**` and the script.
- **F-S7-07 (S7.4, live).** S3's roller lists 5-minute Windows, its price relay records the open print within seconds
  and its settler settles, and S3's house maker already quotes them — the drive trades against the live book and only
  quotes an empty side (a fixed quote crossed the house ask: `PostOnlyWouldCross`, first attempt, no state change).
- **F-S7-08 (S7.5, tap gas).** An owner's first tap in a Window costs **3,031,167** gas on Moderato (≈ 10 new slots at
  250k: the vault's engine position and the market counters, `positionOf`, `positionGrantOf`, the tally struct,
  `marketsOf`); a later tap **1,033,108**; `crankSettle` 273,709; `withdraw` 50,897; `depositAndGrant` 2,825,790. The
  vault relay policy's `maxGas` is 4.5M (first tap + 16 fills + 4 evictions). A lighter first tap (fewer fresh slots,
  e.g. a tally keyed without the `marketsOf` push) would be an owner decision on VaultTally, which D-003 keeps as-is.

## Handoff

**Contract half of S7 done (2026-09-29), branch `stage/S7-vault`.** Commits: `7dbe197` S7.1 seam + payouts ·
`d3f2410` S7.2 vault port · `3980e0f` S7.3 tests · `7a98c9f` S7.4 deploy + relay policy · S7.5 live drive + docs
(this commit). Box 1 ticked; box 2 (off-chain) is open.

- **Live on Moderato** (`contracts/deployments/42431/vault.json`): EventVault `0x5E38dc8b7402FFB608134872a64663e5D75235b8`
  (deployer-vault, tx `0x24d1ab7a…2ffa`, block 37,385,655, Sourcify exact match) against the S2 engine/lens; crank
  opt-out on. One full live tap flow on an S3-rolled SOL Window (acceptance/S7.md): arm → 2 session taps → cap refusal
  → revoke → S3 settles → keeper crank → partial withdraw.
- **Proof:** 52 local tests (Masayume's funding/trading/settlement/CapsVectors on the real engine + the S7 list) with
  both invariants at 256 × 250 and a settle-to-zero `afterInvariant`; the Moderato fork replay; vault relay policy
  vitest. Sizes: EventVault 18,204 B.
- **Decisions:** D-110 (seam + Payouts shape), D-111 (vault seam details, D-062/D-091), D-112 (withdraw refuses on a
  blocking policy), D-113 (suites on the real engine), D-114 (live; what waits for S4).
- **Waits for S4 (sequenced, not cut):** `packages/markets/src/vault/*`, `sessions/session-key.ts` (WebCrypto P-256,
  non-extractable), the relay actually sponsoring `placeFor` (policy is in place, `maxGas` 4.5M), the ported
  `web/src/features/{vault,session}/*` with the E.5 S7 fixes, the D37 onboarding arm, `/settings/account` key listing,
  `idx_vault_*`, killed-tab recovery by `validBefore` (a tx-level property, off chain), and the **settler crank**
  (`crankSettle(owner, m)` for every vault owner of a settled Window — the engine's `redeemFor` refuses the vault, T09).
  Also for that lane: port Masayume's `packages/core/src/vault/{caps.ts,caps.test.ts}` (`simulateCaps`) — the golden
  vectors file is already at `packages/core/src/vault/caps.vectors.json` and must gain the D-091 market check.
- **For S8/S10/S12b:** use `EngineSeam` (`placeMeasured` is for non-resting takers; makers need a PostOnly variant) and
  `Payouts` (`PayoutCheck` to refuse on own calls; `_payOrOwe` + `claimOwed` for third-party payouts). `BookSeeder` and
  `LyingEngine` under `contracts/test/products/harness/` are reusable.
- **Open:** Q-021 (sponsor `place`/`moveToPrivate`) unchanged; F-S7-08 first-tap gas.
