# S8 — Earn: maker vault (after S4; A.4.2)

- [ ] `src/products/maker/{MakerGateway,MarketMakerVault,IMarketMakerVault}.sol`; tests that prove it: Masayume's
  lifecycle, quoting and fork suites, plus `test_escrowIsMeasuredDeltaEqualsReport`, `test_ownExpiredQuoteEvictedToCredit_bookedAsEscrowBack`,
  `test_thirdPartySweep_bookedAsEscrowBack`, `test_pullAfterLockByAnyone`, `test_mergeAfterLockReverts_settleRedeemsPairsAtPar`,
  `test_realizedPerWindow`, `test_withdrawBlockedWhileExpiredUnsettled`, `test_donationDoesNotMoveSharePrice`,
  `invariant_makerLiquidEqualsWallet`; deploy with Masayume launch params.
- [ ] ops earn-quoter on `runActor` (built for real); `/earn` Agari 4-tab supplier UI (A-2b) with realized/on-paper
  yield (A-2c) and Agari's risk bounds; keeper settles closed Windows before withdraw ("Settling 2 of 4"); partial
  withdraw; "Max is X" instead of silent clamps; a typed inline result (no "✓" string matching); `relay/policies/maker.ts`.
  21st starts: tabs 26923, vault card composed from stats 7870 + balance chart 30538 (weak coverage, E.4).
- **Gate:** the vault quotes live Windows, wallet-mode takers fill against it (EventVault takers too once S7 has
  passed), it settles; depth visible via the lens.
  **Rows:** L-50, A-2b, A-2c.

## Findings

_None yet._

## Handoff

_Not started._
