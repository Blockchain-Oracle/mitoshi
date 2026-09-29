<!-- Copied from the approved build plan (v5, 2026-09-29). Change it only through D-entries in docs/plan/decisions.md. -->

## Appendix A — Engine and pillar-1 contracts (spec; S0 copies to `docs/specs/engine.md`)

Sources verified: Agari `anchor/programs/agari-events` + `anchor/crates/agari-common` (unchanged 254f538 → HEAD),
Masayume `contracts/src` @ 68f7a09. [C] = confirmed in source.

### A.1 Storage

**A.1.1 Layout and identities.** One ERC-7201 struct `EngineStorage.Layout`
(`keccak256(abi.encode(uint256(keccak256("tempo.events.engine.v1")) - 1)) & ~0xff`) read by the engine, the
delegatecalled libraries and the lens's slot maths.

| Identity | Formula | Stored as |
|---|---|---|
| `seriesId` | `keccak256(abi.encode(uint16 ticker, uint32 cadenceSec, uint8 basis))` | `seriesIdxOf[seriesId] → uint32` (1-based), `seriesIdOf[idx]` |
| `marketId` | `keccak256(abi.encode(seriesId, uint64 index))` | `markets[marketId]` holds a compact `uint32 mIdx`; `marketIdOf[mIdx]` |
| level key | `uint256(mIdx) << 11 \| side << 10 \| priceTicks` | `levels[key]` |
| `orderId` (uint128) | `uint128(mIdx) << 80 \| uint128(seq48) << 32 \| nodeIdx32` | not stored; checked against `nodes[idx].seq` |

```solidity
struct Layout {
  Config cfg;   // slot 0: mode 8 | nextMIdx 32 | highWater 32 | freeHead 32 | nextSeq 48 | totalOwed 96
  address admin; address pendingAdmin;
  mapping(address => bool) isRoller; mapping(address => bool) crankOptOut;
  mapping(bytes32 => uint32) seriesIdxOf; mapping(uint32 => bytes32) seriesIdOf; mapping(uint32 => Series) series;
  mapping(uint32 => mapping(uint8 => PolicyVersion)) versions;
  mapping(bytes32 => Market) markets; mapping(uint32 => bytes32) marketIdOf;
  mapping(uint32 => uint256[8]) bits;          // [0..3] bid words, [4..7] ask words (1,000 levels)
  mapping(uint256 => Level) levels;
  mapping(uint32 => Node) nodes;               // ONE global recycled pool, 1-based
  mapping(uint32 => mapping(address => Position)) positions;
}
```
`totalOwed` = Σ pulled − Σ paid, used only for the donation-safe assert (`balanceOf(engine) ≥ totalOwed`) and
`sweepSurplus()` (sends `balanceOf − totalOwed` to an immutable treasury). Accounting never reads `balanceOf`.

**A.1.2 Structs.**
```solidity
struct Series { uint16 ticker; uint8 basis; uint32 cadenceSec; uint64 lotBase; uint64 tickBase; uint64 cashUnit;      // 2 slots
                uint64 minLots; uint64 nextIndex; uint40 lastExpiry; uint32 minRestSec; uint32 maxLeadSec;
                uint8 fillsCap; uint8 evictionsCap; uint8 versionCount; }
struct PrintPolicy { address verifier; uint8 source; uint16 graceSec; uint16 minDelaySec; uint16 barLenSec; uint32 openAdmissionSec;
                     bytes32 feedId; uint32 closeAdmissionSec; uint32 strictSec; uint16 maxConfBps; uint16 maxAgeSec; uint8 statusMask; } // 3 slots
struct PolicyVersion { uint40 validFrom; uint40 validUntil; uint16 maxDivergenceBps; uint32 checkAdmissionSec;
                       PrintPolicy primary; PrintPolicy check; }                                                     // 7 slots, append-only
struct Print { int64 priceE8; uint40 sourceTs; uint8 source; uint8 signers; uint8 flags; }                           // 128 bits
struct Market { uint40 tradingStart; uint40 lockAt; uint40 expiry; uint40 openDeadline; uint40 closeDeadline;
                uint32 seriesIdx; uint8 policyVersion; uint8 basis;                                                   // s0
                Print open; Print close; Print checkOpen; Print checkClose;                                           // s1, s2
                uint64 backingLots; uint64 volumeLots; uint64 volumeCash; uint64 tradeCount;                          // s3
                uint16 lastPrice; uint40 lastTradeTs; uint48 eventSeq; uint40 resolvedTs; uint32 payoutYes; uint32 payoutNo;
                uint8 state; uint8 voidReason; uint8 flags; uint8 openKind; uint8 closeKind;                         // s4
                uint64 index; uint32 mIdx; uint32 orderCount; }                                                        // s5 — 6 slots, kept forever
struct Level { uint32 head; uint32 tail; uint64 liveLots; }                                                           // 1 slot
struct Node { address owner; uint64 lots; uint16 price; uint8 kind; uint8 flags;                                      // 2 slots
              uint48 seq; uint32 expireTs; uint32 placedAt; uint32 prev; uint32 next; uint32 holderPrev; uint32 holderNext; }
struct Position { uint64 credit; uint64 lockedCash; uint64 yesFree; uint64 noFree;                                   // slot A (all a taker touches)
                  uint64 yesLocked; uint64 noLocked; uint16 openOrders; uint32 orderHead; uint8 flags; }            // slot B
```
Source enum keeps Agari's numbers: None 0, (1 reserved Pyth), RedStone 2, (3 reserved Switchboard), Attested 4,
DataStreams 5. Status derived in DreamDEX numbering: Listed 0 / Trading 1 / Locked 2 / (3 unused) / Resolved 4 /
Voided 5; a stored terminal `state` wins. `Print.expo` is always −8 (not stored).

**A.1.3 Node pool.** Allocate by popping `freeHead`, else `++highWater`. A non-LIVE node keeps `flags = FREED` and
`expireTs = 0xFFFFFFFF` (both slots stay non-zero), free list threaded through `next` → reuse is non-zero→non-zero
(~5k/slot). `seq` from the global monotonic `cfg.nextSeq`; an `orderId` is live iff `nodes[idx].seq == seq && LIVE`.
Nodes don't store their market (the handle's `mIdx` is trustworthy once `seq` matches). `reserveNodes(n)` is
permissionless (the house pre-grows the pool at deploy).

**A.1.4 Bitmaps/levels.** `bits[mIdx]` = two `uint256[4]`; scans port `ladder.rs` with Solady `LibBit.ffs/fls`.
Levels are created lazily and **not** sentinelled (an emptied level zeroes, minting a T7 credit for the next market).

**A.1.5 Per-holder order list** through `Node.holderPrev/holderNext`, head `Position.orderHead`, cap 16:
`cancelAll` and redeem-drain are O(open orders).

**A.1.6 Dropped Agari fields (Solana-forced):** GlobalConfig token program, Switchboard queue, `program_authorities`,
`cluster_tag`, retention, attestors and RedStone signer lists (signer sets move into immutable verifier contracts);
Series `seat_bond`, `free_books`, bumps (`min_rest_slots` → `minRestSec`, launch 20 s); Market account keys,
`dependents`, closure flags (times narrowed to uint40, `SINGLE_SOURCE` kept); the MarketResult account (folded into
Market, kept forever); Ledger header and Seat flags (holder address is the key; no bond, no program seats); Book
binding/generation/per-book free list (global pool, global `nextSeq`, `Market.orderCount`); OrderNode `seat u16` →
`owner address`, `placed_slot` → `placedAt` seconds.

**A.1.7 Gas (Tempo schedule: new slot 250,000; update ~2,900; recreate with credit ~31k tx total):**

| Operation | Cold credit pool | With credits / warm pool |
|---|---|---|
| First IOC buy by a new holder (1 partial fill) — taker Position A is a new slot | ≈ 350k | ≈ 110k |
| Repeat IOC, same holder and market | ≈ 100k | ≈ 100k |
| Each additional fill: partial / full | ≈ 14–17k / 35–40k (16 full fills ≈ 650k) | same |
| Eviction | ≈ 35k | ≈ 35k |
| Full redeem (clears A, mints a credit; +250k if the holder's pathUSD slot is fresh) | ≈ 75k | ≈ 75k |
| First PostOnly rest by a new maker in a new market (6 new slots) | ≈ 1.5M | ≈ 150k |
| `openWindow` | ≈ 1.8M (≈ $0.001) | same |

To measure (S2.10/X7): the tx gas limit must still cover 250k per new slot; whether the 30M general-lane budget
counts gas net of refunds; empty credit pool at launch. Contingency (recorded, not built): Agari's recycled Books per
Series.

### A.2 Native ABI

**Types** (`EngineTypes.sol`): `PlaceArgs {marketId, kind, orderType, selfMatch, priceTicks, lots, expireTs(uint40),
maxFills, maxEvictions, useCredit, withdrawProceeds, clientId}`; `PlaceResult {filledLots, cashSpent, cashReceived,
creditUsed, transferredIn, withdrawn, refunded, restedLots, cancelledLots, restedOrderId(uint128), fills, evictions,
selfCancels, stopReason, pathMask}`; `OpenWindowArgs {seriesId, index, tradingStart, lockAt, expiry, openKind,
closeKind}`; `RegisterSeriesArgs {ticker, basis, cadenceSec, lotBase, tickBase, minLots, minRestSec, maxLeadSec,
fillsCap, evictionsCap}`. Enums in DreamDEX/Agari numbering (kind BUY_YES 0 / SELL_YES 1 / BUY_NO 2 / SELL_NO 3;
orderType Normal 0 / FOK 1 / IOC 2 / PostOnly 3; selfMatch CancelTaker 0 / CancelMaker 1; path DirectYes / DirectNo /
MintPair / BurnPair; mode Normal / ReduceOnly / Halted; stop Filled / NoCross / FillCap / SkipCap / PostOnlyRested;
remove Expired / SelfMatch / UserCancel / CancelAll / Sweep).

**`IEventsEngine`** (every write pays `msg.sender` only):
```solidity
function placeOrder(PlaceArgs calldata a) external returns (PlaceResult memory);         // returns AND emits OrderExecuted
function cancelOrders(bytes32 m, uint128[] calldata ids, bool withdraw) external returns (uint256, uint64);   // ≤ 16
function reduceOrder(bytes32 m, uint128 id, uint64 newLots) external;
function cancelAll(bytes32 m, uint8 max, bool withdraw) external returns (uint256, uint64);
function sweepExpired(bytes32 m, uint8 max) external returns (uint256);                   // permissionless; drains all after lockAt/terminal
function mintSet(bytes32 m, uint64 lots, bool useCredit) external returns (uint64 transferredIn);
function mergeSet(bytes32 m, uint64 lots, bool withdraw) external returns (uint64 cash, uint64 withdrawn);
function withdrawCredit(bytes32 m, uint64 amount) external;
function recordPrint(bytes32 m, uint8 which, bytes calldata proof) external;              // permissionless, verified
function copyOpenFromPrev(bytes32 m, bytes32 prev) external;
function settle(bytes32 m) external; function voidExpired(bytes32 m) external;
function redeem(bytes32 m) external returns (uint64 total);                               // drains the holder's own resting orders first (T05)
function redeemPartial(bytes32 m, uint8 outcome, uint64 lots) external returns (uint64);  // any holder (E-54)
function redeemFor(bytes32 m, address holder) external returns (uint64 paid, bool heldAsCredit);
function setCrankOptOut(bool on) external;
function openWindow(OpenWindowArgs calldata) external returns (bytes32);                   // ROLLER
function registerSeries(RegisterSeriesArgs calldata) external returns (bytes32);            // ADMIN
function addPolicyVersion(bytes32 seriesId, uint8 index, PolicyVersion calldata) external;  // ADMIN, append-only
function setMode(uint8) external; function setRoller(address, bool) external; function transferAdmin(address) external; function acceptAdmin() external;
function reserveNodes(uint32 n) external; function sweepSurplus() external returns (uint256);
function extsload(bytes32) external view returns (bytes32); function extsload(bytes32[] calldata) external view returns (bytes32[] memory);
function collateral() external view returns (address);
```
One internal `_pay(to, amt, holdOnBlock)` calls `TIP403Registry.validateReceivePolicy(pathUSD, engine, to)`: own calls
revert `ReceivePolicyBlocked`; `redeemFor` rewrites the position to `{credit: total}` and emits `Redeemed(heldAsCredit =
true)` (also if the TIP-20 transfer reverts on a TIP-403 blacklist). A drained position is deleted (mints credits; a
second redeem reverts `NothingToRedeem`).

**`IEngineLens`** (separate contract via `extsload`): `marketRef(m)` (tradingStart, lockAt, expiry, status, state,
lotBase, tickBase, minLots, minRestSec, ticker, seriesId, openE8, closeE8, payoutYes, payoutNo), `status`,
`isResolved`, `isVoided`, `payoutNumerators`, `positionOf(m, h)`, `creditOf(m, h)`, `orderOf(id)`,
`openOrdersOf(m, h)`, `levels(m, isBid, n, minRestSec, maxNodes) → (ticks[], lots[])`, `levelsRaw(...) → Level{price,
quantity}[]` (same fields as `IBinaryPool.Level`), `topOfBook`, `grid(m) → (tickSize, minQuantity, lotSize)`,
`seriesOf`, `policyOf`, plus batch reads from S2.1 (`marketsOf(ids[])`, `positionsOf(holder, ids[])`,
`topOfBook(ids[])`). Walk filter: LIVE, `expireTs > now`, `placedAt + minRestSec ≤ now`; walks traverse nodes.

**`placeOrder` check order** (Agari E-27): mode → market exists → kind/orderType parse → status (Listed admits PostOnly
only → `PreOpenTakerRefused`) → **E-19 `OpenPrintMissing`** (Q-006) → selfMatch → caps → price 1..999 → lots > 0 →
minLots → `expireTs > now` → `expireTs ≤ lockAt` → load position → sell needs free balance → PostOnly cross walk / Take
walk → FOK/IOC → rest → funding (credit `cashReceived` first; `need = cashSpent + restEscrow`) → withdraw proceeds →
counters, `eventSeq`, events → token moves last.

**Events** (every market-scoped call takes `seq = ++eventSeq`): `WindowOpened`, `OrderExecuted(marketId, seq, taker,
…, PlaceResult, backingLots)`, `Fill(marketId, seq, maker, taker, makerOrderId, makerKind, takerKind, path, priceTicks,
lots, makerRemaining)`, `OrderRemoved(…, reason)`, `OrderReduced`, `CompleteSet`, `CreditWithdrawn`, `PrintRecorded`,
`WindowResolved(state, winner, payouts, voidReason, singleSource, openE8, closeE8)`, `Redeemed(holder, by, yesLots,
noLots, payout, credit, total, partial, heldAsCredit)`, admin events.

**Errors** (Agari names and codes kept for the copy map): reused meanings fixed (`BookMarketMismatch`,
`LedgerMarketMismatch` deleted; `MarketNotTerminal` only means not terminal; second redeem → `NothingToRedeem`); 6212
`UnknownRedStoneSigner` actually raised; new `DuplicateRedStoneSigner`, `UnknownMarket`, `UnknownSeries`,
`SeriesExists`, `OpenPrintMissing`, `OrderMarketMismatch`, `ReceivePolicyBlocked`, `CrankRefused`,
`DataStreamsWindowMismatch`, `MarketStatusRefused`, `UnsupportedReportVersion`, `SpotTooOld`, `BadSignerSet`;
Solana-only codes dropped. `errors.json` (selector → name → Agari code → copy key) generated into `packages/clients`.

**A.2.7 IDreamDex → engine** (launch grid tickBase = lotBase = 1000, cu = 1, one = 1e6):

| IDreamDex member | Engine / Lens | Conversion and semantics |
|---|---|---|
| `markets(id)` | `lens.marketRef(id)` | collateral checked once per product; no market/pool addresses (AD-10 by construction); outcome 0/1; engine address = the venue pin; **`expiry` splits: `lockAt` for trading-time checks and order expiry clamps, `expiry` for settlement** |
| `redeem(op, venue, id, idx, amount)` | `redeemPartial(id, idx, lots)` | `lots = amount / lotBase` exact else `OffGrid`; payout `⌊lots·1000·cu·num/1e7⌋` |
| `mergeCompleteSet` | `mergeSet(id, lots, withdraw)` | Trading only |
| `finalizeMarket` / `voidExpired` | `settle` / `voidExpired` | permissionless |
| `settlement()`, `setOperator`, `isOperator` | — | positions internal; no approvals |
| `status()`, `isResolved`, `isVoided`, `payoutNumerators` | lens equivalents | denominator 1e7; (0,0) before terminal |
| `placeBinaryOrder(kind, price, qty, expireNs, type, smo, builder, fee, userData)` | `placeOrder(PlaceArgs)` | `ticks = price / tickBase`; `lots = qty / lotBase`; `expireTs = expireNs / 1e9`; builder/fee dropped (Y-02/Y-18 Owner); `userData` → `clientId`; `(success, id)` ≡ `(true, restedOrderId)`; `lots·ticks·cu == qty·price/one` exactly |
| `cancelOrder(id)` / `cancelExpiredOrders(ids)` | `cancelOrders(m, [id], w)` / `sweepExpired` or own `cancelAll` | stale ids skipped |
| `getOwnOpenOrders()` / `getOrder(id)` | `lens.openOrdersOf(m, h)` / `lens.orderOf(id)` | price = ticks × tickBase; remaining = lots × lotBase; expiry in seconds |
| `getBookLevels(isBid, n)` | `lens.levelsRaw(m, isBid, n, minRestSec, maxNodes)` | raw units; YES terms; NO inversion stays in product maths |
| `getOrderBookParameters()` | `lens.grid(m)` | (1,000, 1,000,000, 1,000) |
| `getWithdrawableBalance` / `withdraw` | `lens.creditOf(m, h)` / `withdrawCredit(m, amt)` | per market; P12 |
| `IOutcomeToken6909.balanceOf` | `lens.positionOf(m, h).yesFree/noFree × lotBase` | free balances only |

Of Masayume's 12 engine semantics: contracts may trade ✔; lazy in-pool credit ✘ (IOC pulls the exact cost; credit only
from evictions, cancels, merges); YES price ✔; sell-beyond-inventory short ✘ (no Masayume contract does it [C]);
PostOnly never crosses ✔; void ½ ✔; permissionless void ✔; marketId identity ✔; grid ✔; settlement fee off (Q-005);
content-addressed oracle → engine print getters; single venue.

**A.2.8 No façade — `EngineSeam` internal library** (reasons: per-market address model, custody/double ledger, hidden
PlaceResult, ERC-6909 per fill, extra call surface).

### A.3 Contract split (≤ 23.5 KB each, measured every S2 step)

| Contract | Kind | Contents | Est. |
|---|---|---|---|
| `EventsEngine` | owns storage | roles, mode, transient guard (OZ `ReentrancyGuardTransient`), `_pull`/`_pay`, funding, sets, withdrawCredit, reserveNodes, sweepSurplus, extsload, dispatch | 11–14 KB |
| `MatchLib` | external library | place / cancel / reduce / cancelAll / sweep | 15–19 KB |
| `AdminLib` | external library | registerSeries, addPolicyVersion validation, openWindow | 7–9 KB |
| `ResolveLib` | external library | recordPrint admission + normalize, copyOpenFromPrev, settle/void, redeem ×3 | 9–12 KB |
| `BookLib`, `PositionLib`, `Grid`, `EngineStorage` | internal libraries | ladder/slab/holder list; apply maker/taker; grid | inlined |
| `EngineLens` | contract | walks + DreamDEX-shaped reads via extsload | 10–14 KB |
| `RedStonePrintVerifier` / `DataStreamsPrintVerifier` / `AttestedPrintVerifier` | stateless | A.5 | 4–6 / 4–5 / 3–4 KB |
| `FairValueGuard` (+ `FairValue` lib) | contract | A.5.4 | 5–7 KB |

Masayume product sizes today (via_ir) [C]: EventVault 14.0, MarketMakerVault 13.8, LeverageReserve 16.0, PrivateDesk
10.4, GameArena 17.5, ParlayReserve 10.6, RangeReserve 17.6, StrategyRegistry 6.7, SeasonPrizePool 2.7 KB.

### A.4 Seam edits

**Shared:** `src/products/shared/EngineSeam.sol` — `resolve(lens, m)`, `toTicks`/`toLots` (exact, else `OffGrid`),
`placeMeasured` (wallet + position before/after; buy: `Δwallet == transferredIn == cashSpent`, `withdrawn == 0`,
`Δfree == filledLots`, `restedLots == 0`; sell mirrored; else `EngineAccountingMismatch`; returns raw units),
`redeemPartialMeasured`. `src/products/shared/Payouts.sol` — `_payOrOwe(to, amt)` (pre-check; blocked → `owedOf[to]`,
`PayoutHeld`; `claimOwed()` pays `msg.sender`). Every product constructor: `(collateral, engine, lens, …)`, checks
`engine.collateral()`, `forceApprove(engine, max)` once, `engine.setCrankOptOut(true)`, no `setOperator`. Venue pins
become structural (`venueId`/oracle-adapter guards and errors deleted). `sweep(bytes32 marketId)` replaces
`sweep(address pool)`.

- **A.4.1 VenueGateway + EventVault:** `MarketRef {marketId, lockAt, expiry, lotBase, tickBase}`; `outcomeId(m, idx) =
  uint256(keccak256(abi.encode(m, idx)))` public; `_cash(m) = wallet + creditOf`; `_placeIoc` keeps external
  `expireNs`, converts at the seam, `PlaceArgs{IOC, CancelTaker, maxFills 16, maxEvictions 4, useCredit false,
  withdrawProceeds true, clientId = grantId}` via `placeMeasured`; forwarder removed (`ERC2771Context`, overrides,
  `_directSender`, `NoDepositViaForwarder` gone; `msg.sender` everywhere); **D-062** (sale to zero frees the grant's
  `openPositions`; `crankSettle` settles to 0 and releases); **D-091** (`Caps.market`, `OutsideGrantMarket`); P12 on
  `withdraw`/`withdrawPrivate`; VaultTally kept; caps timing unchanged (price/escrow before; stake/daily/positions after
  on actual `cashDelta`).
- **A.4.2 MakerGateway + MarketMakerVault:** PostOnly with `useCredit=false, withdrawProceeds=false`; assert `Δwallet ==
  transferredIn == lots·ownTicks·cu` and `restedLots == lots`; `_collectBooked(m)` books every credit withdrawal
  (`escrowBack += amt; liquid += amt`) incl. third-party sweeps; `_pullAll = cancelAll(m,16,false) + _collectBooked`;
  `_merge = mergeSet` (Trading only; after lock `settle` redeems pairs at par); `settle` = pull + one full `redeem`;
  anyone pulls after `lockAt`; `WindowBook.realized` (int128); no inflation guard needed (internal `liquid`).
- **A.4.3 Leverage:** `_expireSec = min(now+60, lockAt)`; `levelsRaw(..., rested ? max(series.minRestSec,
  params.minRestSec) : 0)`; `lens.grid`; **D-116** `VoidWouldShort`; **D-114** (`_exit` via `_payOrOwe`; healthy and
  sellable at birth over rested depth; knock-out over rested whole position); **PD-2** `open(..., spotProof)` refuses
  `AboveFairValue`; `knockOut(id, spotProof)` also requires the fair-value mark to breach (`FairValueHealthy`; Q-022).
- **A.4.4 Private:** `placeMeasured` buy; all live orders in sizing; `lockAt`; **D-117** (`creditFromPool` requires
  `hasBudget[owner]`; `owed + pool + inSlots == wallet` invariant); P12 on `withdraw`; EIP-712 claim domain = chain id +
  desk address.
- **A.4.5 Arena:** `placeMeasured`; card life uses `lockAt`; `revealDeck` via `lens.marketRef`; `_fundAgent`,
  `AgentFunded`, `AgentUnfunded`, `payable` deleted (agent keys = separate addresses, relay-sponsored `placePickFor`);
  P12 on `claimCredit`; `wallet == escrowed + ΣcreditOf`.
- **A.4.6 Parlay:** lens status/payouts; `_bookPrice` rested depth only (D-109); **PD-2** `BelowFairValue` per leg;
  **D-108** `LegOutOfOrder`; **L-38** release `lockedByExpiry[E]` when the last pending leg at E is decided; `claim` via
  `_payOrOwe`.
- **A.4.7 Range:** delete `WindowQuestion`, `IOracleHub`, `hub`/`venueId`; `setAssetTicker(asset, ticker)`;
  `_openingPrint = open.priceE8 / 1e6` → cents (RangeMath + vectors bit-exact); `_center` book-mid over rested levels,
  scale derived from the grid; **PD-2/D-119** `StaleBasis` if `|probitE4(centerQE6) − zSpotE4| > maxDriftE4` (2σ);
  `settle` on `close.priceE8/1e6`; `voidStale` refuses `MustSettle` while the engine has an answer.
- **A.4.8 StrategyRegistry / SeasonPrizePool:** registry keeps reading EventVault; + optional `agentId`
  (`IdentityRegistry.ownerOf == msg.sender`; Moderato `0x8004A818…`, mainnet `0x8004A169…`), `subscribe(id, grantId,
  mode follow|fade, maxFee)` → `FeeAboveMax`, `FeeRecipientBlocked`, SSTORE2 metadata + hash, envelope market scope.
  Season pool: one per season (non-squattable), `distribute` via `_payOrOwe` + `claim()`, `withdrawRemainder(to)`
  pre-checks.

### A.5 Verifiers and FairValue

`IPrintVerifier.verifyPrint(proof, PrintQuery{marketId, which, t, feedId, strictSec, graceSec, minDelaySec, barLenSec,
maxConfBps, statusMask}) → (price, expo, sourceTs, signers)` and `verifySpot(proof, feedId, maxAgeSec)`. Admission
(PD-6 order) runs before the verifier; the engine normalizes to e-8 (exact for expo ≥ −8, floor finer).

- **A.5.1 RedStone** (our port of `redstone.rs`): immutable `signers[1..5]` (= EVM `redstone-primary-prod` set = Agari's
  five [C]) + threshold 3. Payload `N × [feedId 32 ‖ value 32 ‖ ts_ms 6 ‖ valueSize 4 ‖ pointCount 3 ‖ r 32 ‖ s 32 ‖ v 1]`
  + `count 2 ‖ metaSize 3 ‖ marker 0x000002ed57011e0000`. Checks: preparse → feed pin → **every `ts_ms == T·1000`**
  (replaces RedStone's ±3 min default) → `N ≥ (now < T+strictSec ? signerCount : threshold)` → ecrecover each (unknown →
  `UnknownRedStoneSigner`, repeat → `DuplicateRedStoneSigner`) → value bounds → median (even = floored average).
  `verifySpot`: equal timestamps, age ≤ maxAge, ≤ 60 s future, `N ≥ threshold`.
- **A.5.2 Data Streams:** proxy mainnet `0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7` (Moderato `0x72790f9e…Db64`,
  lanes paused without credentials); `verify(fullReport, abi.encode(address(0)))`; version from the feed id; **v11 decode
  order** [C from the archived SPY output]: `(feedId, validFromTimestamp, observationsTimestamp, nativeFee, linkFee,
  expiresAt, mid, lastSeenTimestampNs, bid, bidVolume, ask, askVolume, lastTradedPrice, marketStatus)`; v3 `(…, price,
  bid, ask)`; exact-T `validFrom ≤ T ≤ observations ≤ T + graceSec`; `statusMask & (1 << marketStatus)`; optional spread
  confidence; returns expo −18.
- **A.5.3 Attested (EIP-712):** domain `{name "EventsEngine Print", version "1", chainId, verifyingContract = engine}`;
  `Print(bytes32 marketId,uint8 which,uint40 t,int64 price,int8 expo,bytes32 feedId,uint40 barStart,uint32 barLen,
  uint40 fetchedAt)`; `barStart == T − barLen`; `T + minDelay ≤ fetchedAt ≤ now`; OZ ECDSA; immutable `attestors[≤4]`.
- **A.5.4 FairValue / FairValueGuard (PD-2):** `probUpE6 = Φ(ln(spot/open)/(σ√τ))` with Solady `lnWad` and RangeMath's
  Φ/√/Φ⁻¹; guard holds admin-set `sigmaE8OfSeries`, per-ticker spot verifier + feed (RedStone; Data Streams for NFLX/SPY/
  QQQ/IAU/SPCX on mainnet), `maxSpotAgeSec`; callers Parlay (one-sided floor), Range (two-sided drift, own σ), Leverage
  (open + knockOut). Previews stay view without proof.

### A.6 Tests

- **Engine unit** (`contracts/test/engine/`, `EngineFixture` creates a real TIP-20 via the factory precompile):
  `Grid`, `Paths`, `Examples` (Agari's worked examples 1–8), `Edges` (Agari's, adapted), `Redeem` (incl. receive-policy and TIP-403 holds,
  opt-out refusal, drain on redeem, deletion), `Resolve`, `Prints`, `Roller`, `Admin`, `Modes`, `Book`, `HolderList`,
  `Sweep`, `OpenPrintGate`, `Lens`, `Layout`, `Gas`.
- **Invariants:** `EngineHandler` over 3 markets × 6 actors with Agari's op mix (place 55 %, cancel 10 %, reduce 5 %,
  cancelAll 3 %, sweep 5 %, mint 8 %, merge 5 %, withdraw 5 %, warp 4 %); pairs, **conservation as equality**
  (`balanceOf == backing·1000·cu + Σcredit + ΣlockedCash == totalOwed`), orderCount, level lists, tail/liveLots/bitmap,
  no orphans, free list + sentinel, per-holder escrow + list, cross-market isolation; `afterInvariant()` settles and
  redeems every seat and checks exact conservation in every run (D45); deterministic
  `test_random_12x2500_keepsEveryInvariant`. Bitmap vectors cover empty words and the top bit (Solady `ffs/fls` = 256 on
  zero).
- **Verifiers:** RedStone with `vm.sign` × 5 + Agari's two archived TSLA payloads (median `35,818,500_933`; tampered byte
  → `UnknownRedStoneSigner`, recorded deviation); Data Streams stub + mainnet-fork SPY v11 replay (mid 763.025e18, status
  2, T 1788976800); Attested replay across engines/markets refused.
- **Masayume's contract suites run against the real engine** as seam proof (names kept; `*TestBase` on `EngineFixture` + `BookSeeder`;
  `LyingEngine` fault injection; five DreamDEX mocks retired); golden vectors copied unchanged + `fair.vectors.json`;
  Somnia fork tests become Moderato fork tests.

### A.7 Deviation register (frozen in `docs/specs/engine.md`; owner confirms Q-022)

T01 E-19 open-print gate · T02 `UnknownRedStoneSigner`/`DuplicateRedStoneSigner` · T03 `NothingToRedeem` · T04 partial
redeem for any holder · T05 redeem auto-drains the holder's own orders · T06 immutable signer sets per verifier · T07
Data Streams spread confidence · T08 `lockAt`/`expiry` split · T09 crank opt-out · T10 settlement fee off.

### A.8 Per-stage contract task detail

- **S2:** S2.0–S2.12 as in §6 (files: `src/engine/{EventsEngine,EngineLens,EngineStorage}.sol`,
  `src/engine/libs/{MatchLib,AdminLib,ResolveLib,BookLib,PositionLib,Grid}.sol`, `src/engine/verifiers/**`,
  `src/engine/interfaces/**`; tests under `test/engine/**`; scripts `script/{DeployEngine,RegisterSeries,ReserveNodes}.s.sol`;
  fixtures `test/fixtures/{prints,book.vectors.json}`).
- **S7:** `src/products/shared/{EngineSeam,Payouts}.sol`, `src/products/vault/*`; tests in §6 S7.
- **S8:** `src/products/maker/*`; tests in §6 S8.
- **S9:** `src/products/strategy/*`; new tests `test_feeAboveMax`, `test_fadeConsent`, `test_agentIdMustBeOwned`,
  `test_metadataSstore2RoundTrip`, `test_envelopeMarketScope`, `test_feeRecipientBlocked`.
- **S10:** `src/fair/*`, `src/products/{parlay,range,leverage,private}/*`; deploy scripts with Masayume launch params
  (leverage 3×, premium 8 %, maintenance 120 %, exposure 60 %).
- **S12b:** `src/products/games/*`; new tests `test_noPayableEntries`, `test_agentKeySponsoredFlow`,
  `invariant_arenaWalletEqualsEscrowedPlusCredits`, `test_seasonNotSquattable`, `test_distributeBlockedWinnerHeldOwed`.

---
