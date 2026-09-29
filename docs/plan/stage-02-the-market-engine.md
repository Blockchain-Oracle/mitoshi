# S2 — The market engine (wave 1) — money gate (App. A)

- [x] S2.0 Toolchain check + `script/check-sizes.sh` (fail > 23.5 KB); spikes X6, X7.
- [x] S2.1 **Interface checklist, signed before freeze:** `docs/specs/interface-checklist.md` — every IDreamDex member
  (A.2.7), the 12 engine semantics, E-01…E-72, and the reads C.2.5 needs (batch `marketsOf`, `positionsOf`,
  `topOfBook`), each mapped to a function and a test; signed by the S4/S7/S8/S10/S12b owners. Freeze
  `docs/specs/engine.md` with the deviation register T01–T10 (A.7). Compile-only interfaces
  `src/engine/interfaces/{IEventsEngine,IEngineLens,IPrintVerifier,IEventsEngineEvents}.sol`, `EngineTypes.sol`,
  `EngineErrors.sol`; tag `engine-abi-v1` (seams can start).
- [x] S2.2 `EngineStorage.sol`, `libs/{BookLib,Grid,PositionLib}.sol`. Src: Agari `book/{ladder,slab}.rs`, `grid.rs`,
  `matching/{paths,seats}.rs`. Tests `Book`, `HolderList`, `Grid`.
- [x] S2.3 `libs/MatchLib.sol`. Src: `matching/{engine,place,evict,orders}.rs`. Tests `Paths`, Examples 1–7, `Edges`,
  `Sweep`, `OpenPrintGate`.
- [x] S2.4 `EventsEngine.sol` (dispatch, funding, `_pull`/`_pay` with P12 + TIP-403 fallback, sets, `withdrawCredit`,
  `reserveNodes`, `sweepSurplus`, `extsload`, roles, mode, transient guard). Src: `user_place_order.rs`, `user_sets.rs`.
- [x] S2.5 `libs/AdminLib.sol`. Src: `admin_series.rs`, `policy_rules.rs`, `window_rules.rs`, `roller_open_window.rs`.
- [x] S2.6 `libs/ResolveLib.sol`. Src: `print_rules.rs`, `normalize.rs`, `copy_open_from_prev.rs`, `resolve_rules.rs`,
  `resolve_window.rs`, `redeem.rs`. Tests `Prints`, `Resolve`, `Redeem`, Example 8.
- [x] S2.7 `verifiers/{RedStonePrintVerifier,DataStreamsPrintVerifier,AttestedPrintVerifier}.sol` + `verifiers/lib/*`.
  Src: `print/{redstone,median,attested}.rs`; fixtures = Agari's two archived TSLA payloads + the SPY v11 report; spike X12
  (`verifySpot` latest mode).
- [x] S2.8 `EngineLens.sol`. Src: `book_walk/mod.rs`. Tests `Lens`, `Layout`; regenerated `book.vectors.json` (seconds).
- [x] S2.9 Invariants: `test/engine/invariant/{EngineHandler.sol,EngineInvariants.t.sol}` (Agari's 8 families + cross-
  market isolation) with `afterInvariant()` settling and redeeming every seat and checking exact conservation each run,
  and `EngineRandom.t.sol` (12 × 2,500 deterministic). Src:
  `matching/tests/{random,support}.rs`.
- [x] S2.10 Gas + sizes: `Gas.t.sol` for every A.1.7 row, cold vs credit, via gas snapshot cheatcodes (per-tx under Foundry isolation) and `--gas-snapshot-check` in CI; Moderato measurements; set `fillsCap` and walk
  `maxNodes`; `docs/specs/engine-gas.md`.
- [ ] S2.11 Deploy: `script/{DeployEngine,RegisterSeries,ReserveNodes}.s.sol` (ensure-style, fails on drift;
  `packages/core/src/market/venue-spec.json`: lot = tick = 1000, minLots 1000, minRest 20 s, maxLead 400,000, caps
  16/16, RedStone strict 300 / admission 900 / threshold 3, check admission 120, divergence 25 bp);
  `deployments/42431/engine.json`.
- [ ] S2.12 Fork + live: `test/fork/{Moderato.Engine,Mainnet.DataStreams}.fork.t.sol`; on Moderato: BTC/ETH/SOL 5m
  series, a Window opened, real RedStone open and close, maker + taker, settle, `redeemFor`, a receive-policy hold.
- **Gate:** every suite green; invariants ≥ 256 runs × depth 500 with `afterInvariant` conservation + the deterministic suites; every contract ≥ 1 KB
  under the limit; gas table; Moderato tx hashes; signed checklist; tag `engine-spec-frozen`. **Rows:** M-01…M-05,
  E-rows, G-02, G-06, N-13 (engine).

## Findings

- **F-S2-01 (S2.0, toolchain).** Foundry 1.8.3 (`cae51ad`), solc 0.8.30, `network = "tempo"` resolves Osaka and
  `isolate = true` by default (`forge config`), so every top-level test call is its own transaction: gas snapshots are
  per-tx numbers and no test may rely on transient storage between calls (D-054). Local (non-fork) `forge test`
  executes the Tempo precompiles: the TIP-20 factory creates real tokens, TIP-403 `validateReceivePolicy` answers, and
  the test contract holds `type(uint64).max` pathUSD.
- **F-S2-02 (X6).** Mainnet fork under `network = "tempo"` works (pinned block 41,742,739): precompiles answer, a real
  pathUSD holder can be pranked, the factory creates and mints. forge `deal` **cannot** write a TIP-20 precompile
  balance on a fork (stdStorage finds no slot). Fork tests fund actors by pranking a holder; local tests mint a
  factory-created TIP-20 or use the test contract's pathUSD.
- **F-S2-03 (X7, live on Moderato; acceptance/S2.md).** T7 storage credits (TIP-1060) are live and are the storage
  credits the engine design relies on (D-011): a new slot costs ≈ 250k gross (4 slots = 1,033,438); clearing earns
  one credit per slot **to the contract that cleared it** (`StorageCredits.balanceOf(contract)`), with no refund at
  clear time (T7 removed the clearing refund); a later new slot in the same contract is refunded at tx end in the
  default `Refund` mode (4 credited slots = 53,450 net, 245k creditable + 5k residual each). The **tx gas limit must
  still cover the gross** (limit 1,038,255 for 53,450 used) — so the fills cap and every gas estimate use gross
  numbers. **Block `gasUsed` counts net of the credit refund** (= Σ receipts). **TIP-1016 is not live**: code is
  still 1,000 gas/B (404 B deploy = 931,695 gas). The engine is one shared credit pool, first come first served (the
  T7 docs note shared contracts may attribute credits per user via `Preserve`/`Direct`); the plan's design (credits
  minted by redeems and cancels fund the next market's slots) is exactly the shared-pool behaviour, so it stands.
- **F-S2-04 (S2.1, review).** The S4/S7/S8/S10/S12b owners have not started; the checklist is recorded as **reviewed by
  the integrator** in their place (wave-1 instruction). A later seam need is an ABI v2 through a D-entry.
- **F-S2-05 (S2.1, sweep bound).** Agari's `public_sweep_expired` scans node indices `0..high_water` of one Book
  (≤ 512 nodes). Our pool is global, so the sweep walks the market's own levels (best first, both sides) and visits at
  most `MAX_SWEEP_VISITS = 256` nodes per call while removing at most `max` (1..32). Same keeper semantics (expired
  only before `lockAt`; everything at/after `lockAt` or terminal; nothing to do = success), bounded gas.
- **F-S2-06 (S2.1, T05 scope).** T05 ("redeem auto-drains the holder's own orders") is applied to `redeemPartial` and
  `redeemFor` as well as `redeem`: Agari refused all redeems with `OpenOrdersRemain`, and T05 replaces that refusal, so
  no redeem path can be blocked by the redeemer's own resting orders (the drain is at most 16 orders).
- **F-S2-07 (S2.1, ABI shape).** Choices the spec left open, taken to stay faithful to Agari's semantics: the engine
  picks the highest covering policy version itself (Agari required the roller to pass exactly that one); one `seq` per
  call stamped on every event of the call; enums as `uint8` so bad bytes refuse by Agari's names; prints stored as packed
  `uint128` (a `Market` stays 6 slots — Solidity starts every nested struct on a new slot); `verifyPrint` non-view (the
  Data Streams proxy writes); all errors in one `IEngineErrors` interface inherited by `IEventsEngine`; the event field
  `partial` is `isPartial` (reserved word). Listed in `docs/specs/interface-checklist.md` §5.
- **F-S2-08 (S2.3, test layering).** Agari tests its matching core as pure functions over a `TestVenue` with an mvault
  model (`matching/tests/support.rs`). S2.3 ports that faithfully: `test/engine/harness/MatchHarness.sol` runs the real
  `MatchLib` over the real ERC-7201 layout and checks §8.3 after every call (pairs, conservation as equality, order
  count, level links/tail/liveLots/bits, per-holder lists and escrow). From S2.4 on, the same behaviours are proven end
  to end through `EventsEngine` with a real factory-created TIP-20. MatchLib is split in two files for the 400-line
  rule (`MatchCore` = the inlined walk, fill and rest); runtime 18,669 B.
- **F-S2-09 (S2.4, P12 mechanics).** TIP-1028 receive policies do **not** make a TIP-20 transfer revert: a blocked
  inbound "succeeds" into the `ReceivePolicyGuard` (tip403/receive-policies). So the engine pre-checks
  `validateReceivePolicy(collateral, engine, to)` before every payout and refuses its own calls with
  `ReceivePolicyBlocked`; `redeemFor` holds instead (S2.6). A TIP-403 *token* policy (blacklist) still reverts the
  transfer; `_payOrHold` catches that too. Built-in policy 0 = always-reject, 1 = always-allow. Until `openWindow`
  (S2.5) and `recordPrint` (S2.6) exist, engine tests list markets through `EngineTestHook` (the real engine plus a
  test-only listing function); everything else they run is production code over a real factory-created TIP-20.
- **F-S2-10 (S2.5, verifier binding).** Agari's policy versions name a source; ours also name the immutable verifier
  contract (D-016). `addPolicyVersion` additionally requires the verifier to have code and to answer
  `source() == policy.source`, so a version can never point a source at the wrong prover. The per-source rules carry
  Agari's (RedStone: strict ≥ 1, no delay, ASCII feed; Attested: bar, delay, admissions > delay) and add Data Streams'
  (grace ≥ 1, no delay, a status mask, spread bound ≤ 10,000 bp, report version 3 or 11); Pyth (1) and Switchboard (3)
  stay reserved and refuse. Until the real verifiers exist (S2.7) the admin, roller and resolution suites use
  `test/engine/harness/TestPrintVerifier.sol`, a test-only prover; S2.7 retires it from every suite.
- **F-S2-11 (S2.5, openWindow writes).** `openWindow` writes only the market's non-zero slots (s0, s4, s5) plus
  `marketIdOf`, so a listing creates 4 new slots instead of 7 (≈ 1.0M gas gross, not 1.8M). `lockAt` must fit uint32
  (node expiries) or the listing refuses `BadHorizon`.
- **F-S2-12 (S2.6, redeem shape).** `ResolveLib` returns a `Redemption` and the engine emits `Redeemed` after deciding
  pay-or-hold, so the event's `heldAsCredit` is exact; a held payout re-creates the position as `{credit: total}`
  (then `withdrawCredit` pays once the policy clears). Full redeem deletes the position (both slots zero → storage
  credits); a second redeem, or a holder with nothing, refuses `NothingToRedeem`. A losing position still redeems (pays
  0) and clears, as in Agari. Conservation after settlement is Agari's `owed_after_settlement` (credit + escrow + payout
  per holder); the fixture switches form by market state. The engine now implements the whole `IEventsEngine`; the
  test-only listing hook is gone (markets list through `registerSeries` → `addPolicyVersion` → `openWindow`).
- **F-S2-13 (S2.7, verifiers).** `RedStonePrintVerifier` is our own calldata parser (no BUSL connector): the real
  archived TSLA payloads verify against the production signers (medians match Agari's fixtures). Every posted package
  must be a valid, distinct, configured signature (OZ `tryRecover`: low-s, non-zero) — an unknown or malleated
  signature refuses `UnknownRedStoneSigner`, a repeat `DuplicateRedStoneSigner` (T02); a zero or oversized value
  refuses `InvalidPrintValue` (Agari's SDK dropped such packages below N → `InsufficientRedStoneSigners`; same
  outcome, named). Data Streams: v3/v11 by the feed id's version; the v11 order is confirmed against the real SPY
  report through the real mainnet proxy; a `marketStatus` outside the policy mask refuses `InsufficientVerification`
  (the closest Agari name: the update is not a valid print for the slot); the proxy interface drops `payable` (Tempo
  has no value; same selector). Attested: EIP-712 with `verifyingContract` = the calling engine, so replay across
  engines, chains, markets and slots recovers a different key (`UnknownAttestor`); `verifySpot` uses a typed
  `Spot(feedId, price, expo, observedAt)` under the same domain. The S2.5 test-only prover is retired: every engine
  suite now records real signed prints (5 RedStone test keys; an EIP-712 attestor key). Sizes: RedStone 3,582 B,
  Attested 3,369 B, Data Streams 2,352 B. X12: `verifySpot` proves live gateway "latest" packages (ETH, TSLA---24_7).
  Test gotcha recorded: under via-IR a test's `block.timestamp` can read stale after `vm.warp`; the fixture uses
  `vm.getBlockTimestamp()`. The payload builder for live drives is `scripts/drive/lib/redstone-payload.ts` (ported from
  Agari's `redstonePayload`); the production relay's copy belongs to S3.
- **F-S2-14 (S2.8, lens).** `EngineLens` (16,799 B) reads everything through `extsload` with `LensSlots` (Solidity's
  documented layout rules); `Layout.t.sol` proves every struct round-trips field for field (a full `PolicyVersion`
  byte-identical). Stale or unknown order ids read as a zeroed `OrderView` (views never revert on stale ids, like the
  cancel path); unknown markets/series revert by name. `topOfBook` walks with no rest filter and a 256-node budget.
  `book.vectors.json` is regenerated in seconds by `scripts/fixtures/book-vectors-seconds.mjs` (1 slot → 1 s, so
  every expectation carries over unchanged); all 49 vectors are rested for real on the engine and walked through the
  lens (bids and asks on separate markets because 29 random books are crossed, which a real book never is).
- **F-S2-16 (S2.9, invariants).** The handler drives the real engine, token and RedStone verifier over 3 markets × 6
  actors with Agari's op mix through one `step(seed)` entry (Foundry picks selectors uniformly, so the mix lives in
  the seed, as in Agari's harness). After every call: Agari's 8 families (pairs, conservation as equality — balance ==
  totalOwed == owed, order count, level links, tail/liveLots/bit, no orphans, free list of FREED sentinels + live ==
  highWater, per-holder list and escrow) plus cross-market isolation (a digest of every other market and its
  holders before and after each op). `afterInvariant` settles every market (Up, Down or void by the clock), redeems
  every holder (own or cranked) and requires the engine to end holding exactly zero. Result: **256 runs × depth 500
  (128,000 calls) pass** in 7.7 min; `EngineRandom`: **12 seeds × 2,500 ops** pass with the full check after every op
  and exact settle-and-redeem conservation (1,961 fills). CI runs the invariant suite as its own job.
- **F-S2-15 (S2.10, gas).** Forge's Tempo mode reports the TIP-1060 refund in `lastCallGas().gasRefunded`, and
  `gasTotalUsed − gasRefunded` equals the Moderato receipt exactly (X7), so `Gas.t.sol` snapshots both columns
  (`snapshots/engine.json`, CI `--gas-snapshot-check true`). A state-diff probe found the maker's slot A passing
  through zero mid-fill (`lockedCash −= cash` before `yesFree += q`), which Tempo charges as a new slot (250k gross,
  refunded only if a credit exists): `PositionLib` now writes credit before debit (2 full + 1 partial fill: 726k → 236k
  gross). Headlines: first IOC by a new holder 640k gross / 150k net with credits (it also pays the market's first-trade
  counters slot); repeat IOC 144k; ≈ 47k per additional full fill; 16 fills 848k; eviction ≈ 48k; full redeem 88k;
  first PostOnly rest 1.88M cold / 154k net on a warm pool; `openWindow` 1.07M; lens ≈ 15k per node. Decisions: fill
  caps stay 16/16 (worst placement ≈ 1.95M gross ≪ 30M), on-chain walks use `maxNodes = 64`, the house reserves the
  pool at deploy. Table and reasoning: `docs/specs/engine-gas.md`; the Moderato receipts of the S2.12 drive add the
  tx-level column.

## Handoff

S2.0–S2.10 done. Next: S2.11 deploy scripts.
