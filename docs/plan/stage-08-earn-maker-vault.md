# S8 — Earn: maker vault (after S4; A.4.2)

- [x] `src/products/maker/{MakerGateway,MarketMakerVault,IMarketMakerVault}.sol`; tests that prove it: Masayume's
  lifecycle, quoting and fork suites, plus `test_escrowIsMeasuredDeltaEqualsReport`, `test_ownExpiredQuoteEvictedToCredit_bookedAsEscrowBack`,
  `test_thirdPartySweep_bookedAsEscrowBack`, `test_pullAfterLockByAnyone`, `test_mergeAfterLockReverts_settleRedeemsPairsAtPar`,
  `test_realizedPerWindow`, `test_withdrawBlockedWhileExpiredUnsettled`, `test_donationDoesNotMoveSharePrice`,
  `invariant_makerLiquidEqualsWallet`; deploy with Masayume launch params.
- [ ] ops earn-quoter on `runActor` (built for real); `/earn` Agari 4-tab supplier UI (A-2b) with realized/on-paper
  yield (A-2c) and Agari's risk bounds; keeper settles closed Windows before withdraw ("Settling 2 of 4"); partial
  withdraw; "Max is X" instead of silent clamps; a typed inline result (no "✓" string matching); `relay/policies/maker.ts`.
  21st starts: tabs 26923, vault card composed from stats 7870 + balance chart 30538 (weak coverage, E.4).
  Progress 2026-10-09 (S23 gate, F-S23-10: Range/Moonshot/Parlay found no depth without the manual script): the ops
  **earn-quoter** runs on `runActor` in the default set — each pass settles the vault's closed Windows, then rests a
  two-sided quote on every Trading crypto Window with its opening print and ≥ 120 s left, a 15-tick half spread around
  the FairValueGuard's model at ops' signed spot, never crossing the book, inside the vault's band and spread floor,
  requoted on a 30-tick move or after 120 s (`actors/earn-quoter/{decide,index}.ts` + test). `setMaker(earn-quoter)`
  from `deployer-maker` (0x18e84b37…a31c, block 38,892,496); `EARN_QUOTER_PRIVATE_KEY` added to the testnet ops app
  (runtime only). Still in this box: the `/earn` 4-tab supplier UI and the rest listed above.
- **Gate:** the vault quotes live Windows, wallet-mode takers fill against it (EventVault takers too once S7 has
  passed), it settles; depth visible via the lens.
  **Rows:** L-50, A-2b, A-2c.

## Findings

- **F-S8-01 (S8.1, seam shape).** The maker needs four measured calls of its own in `EngineSeam` (`restMeasured`,
  `collectCreditMeasured`, `mergeMeasured`, `redeemAllMeasured`); every credit the engine leaves the vault — its own
  cancel, its own expired quote evicted by its next `quote`'s cross walk, a stranger's `sweepExpired`, a taker's
  eviction — is booked on one path (`_collectBooked` → `escrowBack`), which is what makes `wallet == liquid` an
  equality. D-115.
- **F-S8-02 (S8.2, real engine).** Masayume's venue refunded an expired quote inside the next placement; the engine
  never does (E-33, D-017), so `test_quote_booksTheVenuesLazyRefundOfAnExpiredQuote` now proves the opposite: both
  pairs stay deployed and a pull returns both to the cent. `test_pull_collectsARefundThatLandsAsPoolCredit` proves the
  cancel's credit is collected in the same call. D-116.
- **F-S8-03 (S8.2, sizes/invariants).** MarketMakerVault runtime **16,501 B** (initcode 18,345 B); files ≤ 400 lines
  (vault 336, seam test 382). The op-mix invariant handler drives real quotes, IOC fills, merges, pulls, third-party
  sweeps, donations, warps and settlements (sampled run: 72 successful calls, 7 fills); `afterInvariant` settles every
  Window and exits every supplier — the vault ends holding exactly the donations.
- **F-S8-04 (S8.3, deploy).** 20,112,470 gas for the vault; `setMaker` 279,631. The launch params are Masayume's.
  Maker = admin = `deployer-maker` until S4's earn-quoter (`setMaker`, key provisioned). D-117.
- **F-S8-05 (S8.4, live).** Many rolled Windows carry neither an open print nor house quotes and end voided; the drive
  waits for a Trading Window with its open print (takers need it, T01) and prices 10 ticks inside a ≥ 40-tick house
  book, or 0.48/0.52 on an empty one. The gate Window had S3's house at 0.471/0.531; it was voided (no close print),
  so the vault's settle paid 0.50 a side — realized +0.118 on the Window.
- **F-S8-06 (S8.4, gas).** First `quote` on a Window 2,381,141 (fresh engine position, book, open list, history); a
  later quote 373,680; `merge` 461,769; `pull` 226,773; `settle` 248,236; `withdraw` 54,731; `supply` (first)
  1,050,917. The relay policy's `maxGas` 2M covers `settle` with 16 resting orders.

## Handoff

**Contract half of S8 done (2026-09-29), branch `stage/S8-maker`.** Commits: `cfb13b6` S8.1 port · `1ae4a69` S8.2
tests · `d9bcc7d` S8.3 deploy + relay policy · S8.4 live gate + docs (this commit). Box 1 ticked; box 2 (off-chain)
open except `relay/policies/maker.ts`, which is done.

- **Live on Moderato** (`contracts/deployments/42431/maker.json`): MarketMakerVault
  `0xa31F6B5a585fF331cC13Fd1c6FAa282024Ca32a6` (deployer-maker, tx `0x9ed3421b…2510`, block 37,403,453, Sourcify
  exact match), launch params, crank opt-out on, maker = admin = `deployer-maker`. Full gate on a live Window
  (acceptance/S8.md): quote → depth via `lens.levelsRaw` → wallet taker + EventVault taker fill → stranger merge →
  quote #2 → stranger pull after lock → S3 void → stranger settle → partial withdraw. The vault still holds 25.059
  of the throwaway supplier's supply.
- **Proof:** Masayume's lifecycle 11 + quoting 8 + the Moderato fork test on the real engine, the seam suite 13, three
  invariants (256 × 250); whole `test/products/**` 85/85.
- **Decisions:** D-115 (seam), D-116 (suites on the real engine), D-117 (params, maker key), D-118 (relay policy),
  D-119 (live).
- **Waits for S4 (sequenced, not cut):** the ops **earn-quoter** actor on `runActor` (port Masayume's
  `services/ops/src/actors/market-maker/{decide,env,index}.ts` + `packages/core/src/maker/quoting.ts`; then
  `setMaker(earn-quoter)` from `deployer-maker`); the settler cranking `vault.settle(m)` for every closed Window the
  vault quoted ("Settling 2 of 4" before a withdraw); `packages/markets/src/maker/*` (read/write/book/errors from
  Masayume); the `/earn` Agari 4-tab supplier UI (A-2b) with realized/on-paper yield (A-2c), risk bounds, partial
  withdraw, "Max is X", typed inline results; 21st starts tabs 26923, stats 7870, balance chart 30538.
- **Open:** none new.
