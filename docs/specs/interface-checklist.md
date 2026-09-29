# Engine interface checklist (S2.1) — frozen at tag `engine-abi-v1`

The contract every seam builds against: `contracts/src/engine/interfaces/{IEventsEngine,IEngineLens,IPrintVerifier,
IEventsEngineEvents}.sol`, `EngineTypes.sol`, `EngineErrors.sol`. Spec: `docs/specs/engine.md` (App. A, frozen with the
deviation register). Sources ported: Agari `03b30abbbfe7ddc3cac4927c7c573e52f74d2d49` (`anchor/programs/agari-events`,
`anchor/crates/agari-common`), Masayume `68f7a09` (`contracts/src/interfaces/IDreamDex.sol` and the seven seams).

**Review record.** The plan asks for the S4/S7/S8/S10/S12b owners to sign before the freeze. Those lanes have not
started; per the wave-1 instruction this checklist is **reviewed by the integrator** in their place, and any change a
seam owner needs later is an ABI v2 through a D-entry (never an edit of v1).

| Seam owner | Stage | Reviewed by | Date |
|---|---|---|---|
| Web first call (wallet mode, orders, redeem, reads) | S4 | integrator (in place of the S4 owner) | 2026-09-29 |
| EventVault / VenueGateway | S7 | integrator (in place of the S7 owner) | 2026-09-29 |
| MarketMakerVault / MakerGateway | S8 | integrator (in place of the S8 owner) | 2026-09-29 |
| Parlay, Range, Leverage, Private | S10 | integrator (in place of the S10 owner) | 2026-09-29 |
| Arena / games | S12b | integrator (in place of the S12b owner) | 2026-09-29 |

Tests named below live under `contracts/test/engine/` (verifiers under `test/engine/verifiers/`, invariants under
`test/engine/invariant/`). A row is proven when its test passes at the S2 gate.

## 1. Every `IDreamDex` member (A.2.7) → engine function → test

Launch grid: tickBase = lotBase = 1,000, cu = 1, one = 1e6 (6-dp pathUSD).

| IDreamDex member | Engine / Lens | Conversion and semantics | Test |
|---|---|---|---|
| `IBinaryModule.markets(id)` | `lens.marketRef(id)` (`MarketRef`), `lens.marketsOf(ids)` | No market/pool addresses (AD-10 by construction); collateral read once from `engine.collateral()`; outcome 0 = YES, 1 = NO; `expiry` splits: `lockAt` for trading-time checks and order-expiry clamps, `expiry` for settlement (T08) | `Lens.t.sol::test_marketRefMatchesStorage`, `::test_marketsOfBatch`, `Edges.t.sol::test_expiryAfterLockRefused` |
| `IBinaryModule.redeem(op, venue, id, idx, amount)` | `redeemPartial(id, idx, lots)` | `lots = amount / lotBase` exact else `OffGrid` (seam); payout `⌊lots·1000·cu·num/1e7⌋`; any holder (T04) | `Redeem.t.sol::test_partialRedeemAnyHolder`, `Grid.t.sol::test_redeemPayoutFloors` |
| `IBinaryModule.mergeCompleteSet(op, venue, id, amount)` | `mergeSet(id, lots, withdraw)` | Trading only (E-40); pays `lots·1000·cu` as credit, optionally withdrawn | `Sets.t.sol::test_mergeCreditsAndWithdraws`, `::test_mergeOnlyWhileTrading` |
| `IBinaryModule.finalizeMarket(id)` | `settle(id)` | permissionless; resolves once | `Resolve.t.sol::test_settleOnce` |
| `IBinaryModule.settlement()`, `IOutcomeToken6909.setOperator/isOperator` | — | positions are internal; no approvals exist to grant | n/a (no surface) |
| `IBinaryMarket.status()` | `lens.status(id)` | DreamDEX numbering: Listed 0, Trading 1, Locked 2, (3 unused), Resolved 4, Voided 5; stored terminal state wins | `Lens.t.sol::test_statusFollowsClockAndState` |
| `IBinaryMarket.isResolved()` / `isVoided()` | `lens.isResolved(id)` / `lens.isVoided(id)` | from the stored state | `Lens.t.sol::test_statusFollowsClockAndState` |
| `IBinaryMarket.payoutNumerators()` | `lens.payoutNumerators(id)` | `[yes, no]` over 1e7; `(0, 0)` before terminal | `Lens.t.sol::test_payoutNumerators` |
| `IBinaryMarket.voidExpired()` | `voidExpired(id)` | permissionless, clock rule only (no admin void) | `Resolve.t.sol::test_voidOnlyAfterAMissedDeadline` |
| `IBinaryMarket.expiry()` | `marketRef(id).expiry` | settlement time | `Lens.t.sol::test_marketRefMatchesStorage` |
| `IBinaryPool.placeBinaryOrder(kind, price, qty, expireNs, type, smo, builder, fee, userData)` | `placeOrder(PlaceArgs)` | `ticks = price / tickBase`; `lots = qty / lotBase`; `expireTs = expireNs / 1e9`; builder/fee dropped (Y-02/Y-18 Owner); `userData` → `clientId`; `(success, id) ≡ (true, restedOrderId)`; `lots·ticks·cu == qty·price/one` exactly | `Grid.t.sol::testFuzz_dreamDexUnitsConvertExactly`, `Examples.t.sol::*` |
| `IBinaryPool.cancelOrder(id)` | `cancelOrders(m, [id], withdraw)` | stale ids skipped; foreign live id → `NotOrderOwner`; other market → `OrderMarketMismatch` | `Edges.t.sol::test_staleHandlesSkippedAfterReuse`, `HolderList.t.sol::test_cancelForeignOrderRefused` |
| `IBinaryPool.cancelExpiredOrders(ids)` | `sweepExpired(m, max)` (permissionless) or own `cancelAll(m, max, w)` | sweep evicts expired orders; drains every order at/after `lockAt` or terminal | `Sweep.t.sol::*` |
| `IBinaryPool.getOwnOpenOrders()` | `lens.openOrdersOf(m, holder)` | walks the per-holder list | `Lens.t.sol::test_openOrdersOfWalksTheHolderList` |
| `IBinaryPool.getOrder(id)` | `lens.orderOf(id)` | price = ticks × tickBase; remaining = lots × lotBase at the seam; expiry in seconds | `Lens.t.sol::test_orderOfLiveAndStale` |
| `IBinaryPool.getBookLevels(isBid, n)` | `lens.levelsRaw(m, isBid, n, minRestSec, maxNodes)` | raw units, YES terms; NO inversion stays in product maths; walk filter LIVE, `expireTs > now`, rested ≥ `minRestSec` | `Lens.t.sol::test_levelsRawMatchesIBinaryPoolLevel`, `::test_walkFilter` |
| `IBinaryPool.getOrderBookParameters()` | `lens.grid(m)` | `(1,000, 1,000,000, 1,000)` on the launch grid | `Lens.t.sol::test_gridIsDreamDexShaped` |
| `IBinaryPool.getWithdrawableBalance(owner, token)` | `lens.creditOf(m, holder)` | per market | `Lens.t.sol::test_positionAndCredit` |
| `IBinaryPool.withdraw(token, amount)` | `withdrawCredit(m, amount)` | pays `msg.sender` only; P12 pre-check | `Sets.t.sol::test_withdrawCreditPaysCallerOnly`, `Redeem.t.sol::test_ownPayoutRefusedByReceivePolicy` |
| `IBinaryPool.marketNonce()` | — | identity is `marketId = keccak(seriesId, index)` | `Layout.t.sol::test_identities` |
| `IOutcomeToken6909.balanceOf(owner, id)` | `lens.positionOf(m, h).yesFree / noFree` × lotBase | free balances only | `Lens.t.sol::test_positionAndCredit` |
| `IOracleHub.pullNumericAnswer / questionKeyOf / questionIdByKey` (Range) | `lens.marketRef(m).openE8 / closeE8`, `lens.printOf(m, which)` | engine print getters replace the content-addressed oracle | `Lens.t.sol::test_printsReadBack` |

## 2. Masayume's 12 engine semantics (MS §3.2) → engine behaviour → test

| # | Semantic | Engine | Test |
|---|---|---|---|
| 1 | Contracts may place orders; products book fills by balance deltas | ✔ any `msg.sender`; `placeOrder` also **returns** `PlaceResult` so seams assert `Δwallet == transferredIn` | `Examples.t.sol::test_contractTakerGetsItsResult` |
| 2 | IOC refunds may land as lazy in-pool credit | ✘ by design: IOC pulls the exact cost after matching (E-33); credit only arises from evictions, cancels, merges and sells | `Edges.t.sol::test_iocPullsExactCostNoLazyCredit` |
| 3 | YES-price convention; BUY_NO at p rests as a YES ask at p | ✔ | `Paths.t.sol::*` |
| 4 | Selling beyond inventory mints a short | ✘ (no Masayume contract does it [C]); a sell needs free balance → `InsufficientOutcome` | `Edges.t.sol::test_sellNeedsFreeBalance` |
| 5 | PostOnly refuses to cross | ✔ (`PostOnlyWouldCross`, own orders included) | `Edges.t.sol::test_postOnlyRefusesAnyLiveCross` |
| 6 | Void redeems ½ per token; one-hot on resolve | ✔ `(5e6, 5e6)` / `(1e7, 0)` / `(0, 1e7)` | `Redeem.t.sol::test_example8UpDownVoid` |
| 7 | `voidExpired` is permissionless | ✔ | `Resolve.t.sol::test_voidOnlyAfterAMissedDeadline` |
| 8 | Identity is `bytes32 marketId`; the pool is never stored | ✔ single venue, `marketId` everywhere | `Layout.t.sol::test_identities` |
| 9 | The lot/tick/minimum grid applies to every order | ✔ ticks 1..999, `minLots`, exact seam conversion | `Edges.t.sol::test_checkOrderRefusesInOrder` |
| 10 | Per-market settlement fee read by the SDK | off (Q-005, T10); no fee field exists | `Redeem.t.sol::test_example8UpDownVoid` (payouts are gross) |
| 11 | Prints derivable from `(asset, time)` (Range) | engine print getters | `Lens.t.sol::test_printsReadBack` |
| 12 | `originOperatorId` / `originVenueId` namespaces | single venue: the engine address is the venue pin | n/a |

## 3. Engine rows E-01 … E-72 (AS §2) → function → test

| Rows | What | Engine function(s) | Test |
|---|---|---|---|
| E-01 | Grid, cash unit, registration exactness | `registerSeries` (`BadGrid`), `Grid` lib | `Grid.t.sol::test_cashUnitRegistrationRules`, `::test_pairCostsExactlyItsBacking` |
| E-02 | Kinds, one YES-quoted book, sides | `MatchLib`, `BookLib` | `Paths.t.sol::*` |
| E-03 | Four fill paths at the maker's price | `PositionLib.applyMaker/applyTaker` | `Paths.t.sol::*` (8 rows), `Examples.t.sol::*` |
| E-04 | Payout vector | `ResolveLib` | `Resolve.t.sol::test_closeAtOrAboveOpenPaysUp`, `Redeem.t.sol::test_example8UpDownVoid` |
| E-05 | Caps as gas bounds | `placeOrder` (`maxFills ≤ min(32, fillsCap)`, `maxEvictions ≤ min(16, evictionsCap)`, 64 skips, 16 open orders, 16 handles) | `Edges.t.sol::test_capsValidated`, `::test_openOrderLimit`, `Gas.t.sol` |
| E-06 | Config → roles, immutable collateral | constructor, `setRoller`, `transferAdmin/acceptAdmin` | `Admin.t.sol::test_roles`, `::test_twoStepAdmin` |
| E-07 | Series | `registerSeries`, `lens.seriesOf` | `Admin.t.sol::test_registerSeriesChecks` |
| E-08, E-09 | Policy versions, validation, highest covering | `addPolicyVersion` (`AdminLib`) | `Admin.t.sol::test_policyValidation`, `::test_policyVersionsAppendOnly`, `Roller.t.sol::test_highestCoveringVersion` |
| E-10, E-11 | Market, Print | `openWindow`, `PrintLib`, `lens.marketOf` | `Layout.t.sol::test_marketPacking`, `Lens.t.sol::test_printsReadBack` |
| E-12 | Book: levels, bitmaps, FIFO, recycled nodes, ABA-safe ids | `BookLib`, node pool | `Book.t.sol::*` |
| E-13 | Positions (free/locked/credit) | `PositionLib` | `Paths.t.sol::*`, invariants |
| E-14, E-15 | mvault, MarketResult | folded: one engine balance, results in `Market` | `Cash.t.sol::test_conservationAfterEveryCall` |
| E-16, E-17 | Status and permissions | `status()`, per-call checks | `Lens.t.sol::test_statusFollowsClockAndState`, `Modes.t.sol::test_exitsNeverBlocked` |
| E-18 | Modes | `setMode`; ReduceOnly blocks buys/mint/roller; Halted blocks placement/mint/roller | `Modes.t.sol::*` |
| E-19 | Open print before taker fills | `placeOrder` → `OpenPrintMissing` (T01) | `OpenPrintGate.t.sol::*` |
| E-20…E-23 | Admin init, authorities, mode, register | constructor, `setRoller`, `setMode`, `registerSeries` | `Admin.t.sol::*` |
| E-24 | admin_add_book | dropped (SF) | — |
| E-25 | Append-only policy versions | `addPolicyVersion` | `Admin.t.sol::test_policyVersionsAppendOnly` |
| E-26 | Roller open window | `openWindow` | `Roller.t.sol::*` |
| E-27 | Place check order | `placeOrder` | `Edges.t.sol::test_checkOrderRefusesInOrder` |
| E-28 | Match loop budgets | `MatchLib` | `Edges.t.sol::test_skipCapStopsAndCancels`, `Examples.t.sol::test_example6FillCapCancelsRemainder` |
| E-29 | Order types | `MatchLib` | `Edges.t.sol::test_iocNoFillRefusesEvenAfterEvicting`, `::test_fokPartialRefusedFullAccepted` |
| E-30 | PostOnly cross walk + pre-open | `MatchLib` | `Edges.t.sol::test_postOnlyRefusesAnyLiveCross`, `::test_listedWindowRestsPostOnlyRefusesTakers`, `Examples.t.sol::test_example7PostOnlyOverOwnExpiredQuote` |
| E-31 | Self-match | `MatchLib` | `Edges.t.sol::test_selfMatch`, `::test_selfCancelSpendsFillBudget` |
| E-32 | Rest | `MatchLib`, `BookLib`, holder list | `HolderList.t.sol::*`, `Edges.t.sol::test_openOrderLimit` |
| E-33 | Funding after matching, credit first | `placeOrder` + `EventsEngine._pull/_pay` | `Examples.t.sol::test_example5CreditFirstFunding`, `Cash.t.sol::*` |
| E-34 | Makers credited, never pushed | `PositionLib.applyMaker` | `Paths.t.sol::*` |
| E-35 | Eviction | `MatchLib.removeNode` | `Examples.t.sol::test_example7PostOnlyOverOwnExpiredQuote`, `Sweep.t.sol::*` |
| E-36 | Cancel, reduce, cancel-all | `cancelOrders`, `reduceOrder`, `cancelAll` | `HolderList.t.sol::*`, `Edges.t.sol::test_reduceKeepsQueuePriority` |
| E-37 | Permissionless sweep | `sweepExpired` | `Sweep.t.sol::*` |
| E-38 | Seats | dropped (SF): the holder address is the key | — |
| E-39…E-41 | Mint, merge, withdraw credit | `mintSet`, `mergeSet`, `withdrawCredit` | `Sets.t.sol::*` |
| E-42 | Ledger growth | dropped (SF) | — |
| E-43 | Shared admission (PD-6) | `recordPrint` (`ResolveLib`) | `Prints.t.sol::test_admissionOrder` |
| E-44, E-47 | Pyth, Switchboard | not on Tempo; source ids 1 and 3 reserved; their rules carry to RedStone / Data Streams / Attested | `Admin.t.sol::test_policyValidation` (reserved sources refused) |
| E-45 | RedStone | `RedStonePrintVerifier` | `verifiers/RedStoneVerifier.t.sol::*` |
| E-46 | Attested | `AttestedPrintVerifier` (EIP-712) | `verifiers/AttestedVerifier.t.sol::*` |
| E-48 | Copy open from prev | `copyOpenFromPrev` | `Prints.t.sol::test_copyOpenFromPrev` |
| E-49 | Normalization | `ResolveLib.normalize` | `Prints.t.sol::test_normalize` |
| E-50 | Settle with cross-check | `settle` | `Resolve.t.sol::*` |
| E-51 | Void expired | `voidExpired` | `Resolve.t.sol::test_voidOnlyAfterAMissedDeadline` |
| E-52 | Settlement fee | none (Q-005, T10) | `Redeem.t.sol::test_example8UpDownVoid` |
| E-53 | Full redeem | `redeem` (drains own orders first, T05; deletes; `NothingToRedeem`, T03) | `Redeem.t.sol::test_redeemDrainsOwnOrdersThenPays`, `::test_secondRedeemRefused` |
| E-54 | Partial redeem, any holder | `redeemPartial` | `Redeem.t.sol::test_partialRedeemAnyHolder` |
| E-55 | Crank pays the owner | `redeemFor` (P12, hold as credit, opt-out) | `Redeem.t.sol::test_redeemForPaysHolder`, `::test_redeemForHoldsBlockedPayoutAsCredit`, `::test_crankOptOut` |
| E-56…E-58 | Book release, ledger close, market close | dropped (SF); results permanent; accounting never reads `balanceOf` | `Cash.t.sol::test_donationIsNotUserMoney` |
| E-59 | Book walks | `EngineLens.levels/levelsRaw/topOfBook` | `Lens.t.sol::*`, `book.vectors.json` |
| E-60 | PlaceResult returned and emitted | `placeOrder` | `Examples.t.sol::test_contractTakerGetsItsResult` |
| E-61 | Events with `(marketId, seq)` | every market-scoped call | `Lens.t.sol::test_eventSeqHasNoGaps` |
| E-62 | Candles and read model | off chain (S3.5 indexer) | — |
| E-63 | Invariants | `test/engine/invariant/*`, `EngineRandom.t.sol` | invariant suites |
| E-64 | Timing in seconds | `minRestSec` 20, expiries in seconds | `Lens.t.sol::test_walkFilter` |
| E-65…E-71 | Maker program, house maker, product pattern | products (S7/S8/S10/S12b) against this ABI; `PlaceResult` + before/after assert | seam suites (S7+) |
| E-72 | Masayume compatibility | §1 above (no façade, D-012) | §1 tests |

## 4. Reads the platform layer needs (C.2.5) → lens → test

| Need | Lens function | Test |
|---|---|---|
| `marketOf` | `marketOf(m)` (full stored `Market`), `marketRef(m)` | `Lens.t.sol::test_marketRefMatchesStorage` |
| `marketsOf(ids[])` | `marketsOf(ids)` | `Lens.t.sol::test_marketsOfBatch` |
| `levels` | `levels(m, isBid, n, minRestSec, maxNodes)`, `levelsRaw(...)` | `Lens.t.sol::test_walkFilter` |
| `topOfBook(ids[])` | `topOfBook(m)`, `topOfBook(ids)` | `Lens.t.sol::test_topOfBookBatch` |
| `positionOf`, `positionsOf(holder, ids[])` | same names | `Lens.t.sol::test_positionAndCredit`, `::test_positionsOfBatch` |
| `creditOf` | `creditOf(m, holder)` | `Lens.t.sol::test_positionAndCredit` |
| `seriesOf` | `seriesOf(seriesId)`, `policyOf(seriesId, i)`, `seriesCount`, `seriesIdAt` | `Admin.t.sol::test_registerSeriesChecks` |
| `openOrdersOf` | `openOrdersOf(m, holder)` | `Lens.t.sol::test_openOrdersOfWalksTheHolderList` |
| events: indexed `marketId` + per-market `seq` | `IEventsEngineEvents` | `Lens.t.sol::test_eventSeqHasNoGaps` |
| settler skip-list | `crankOptedOut(holder)` | `Redeem.t.sol::test_crankOptOut` |

## 5. ABI decisions taken at the freeze (details in the stage file's Findings)

1. **`OpenWindowArgs` carries no policy version**: the engine picks the highest version covering both boundaries
   (Agari required the roller to name exactly that version; the effect is identical and a roller cannot pick wrong).
2. **One `seq` per call**, taken when the call starts and stamped on every event it emits (`Fill`, `OrderRemoved`,
   `OrderExecuted`, …); per-fill and per-removal logs replace Agari's batched records (E-61).
3. **Enums travel as `uint8`** so a bad byte refuses by Agari's error name (`InvalidOrderArgs`, `BadPrintSlot`), not an
   ABI-decoder panic.
4. **`Market` stores prints packed** (`uint128` each, two per slot; `PrintLib`) so a market stays at 6 slots; the lens
   decodes them (`printOf`, `MarketRef.openE8/closeE8`).
5. **`IPrintVerifier.verifyPrint` is non-view** (the Data Streams proxy's `verify` writes); verifiers are stateless.
6. **Errors live in `IEngineErrors`**, inherited by `IEventsEngine`, so one ABI decodes every revert (engine,
   libraries, verifiers); `@custom:agari` carries Agari's code for the copy map.
7. **`redeemPartial` also drains the holder's own orders first** (T05 applies to every redeem).
8. **`sweepExpired` visits at most 256 nodes per call** (Agari scanned a bounded slab of ≤ 512 nodes).
9. `Redeemed.isPartial` (the word `partial` is reserved in Solidity).
