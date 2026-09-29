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
- [ ] S2.4 `EventsEngine.sol` (dispatch, funding, `_pull`/`_pay` with P12 + TIP-403 fallback, sets, `withdrawCredit`,
  `reserveNodes`, `sweepSurplus`, `extsload`, roles, mode, transient guard). Src: `user_place_order.rs`, `user_sets.rs`.
- [ ] S2.5 `libs/AdminLib.sol`. Src: `admin_series.rs`, `policy_rules.rs`, `window_rules.rs`, `roller_open_window.rs`.
- [ ] S2.6 `libs/ResolveLib.sol`. Src: `print_rules.rs`, `normalize.rs`, `copy_open_from_prev.rs`, `resolve_rules.rs`,
  `resolve_window.rs`, `redeem.rs`. Tests `Prints`, `Resolve`, `Redeem`, Example 8.
- [ ] S2.7 `verifiers/{RedStonePrintVerifier,DataStreamsPrintVerifier,AttestedPrintVerifier}.sol` + `verifiers/lib/*`.
  Src: `print/{redstone,median,attested}.rs`; fixtures = Agari's two archived TSLA payloads + the SPY v11 report; spike X12
  (`verifySpot` latest mode).
- [ ] S2.8 `EngineLens.sol`. Src: `book_walk/mod.rs`. Tests `Lens`, `Layout`; regenerated `book.vectors.json` (seconds).
- [ ] S2.9 Invariants: `test/engine/invariant/{EngineHandler.sol,EngineInvariants.t.sol}` (Agari's 8 families + cross-
  market isolation) with `afterInvariant()` settling and redeeming every seat and checking exact conservation each run,
  and `EngineRandom.t.sol` (12 × 2,500 deterministic). Src:
  `matching/tests/{random,support}.rs`.
- [ ] S2.10 Gas + sizes: `Gas.t.sol` for every A.1.7 row, cold vs credit, via gas snapshot cheatcodes (per-tx under Foundry isolation) and `--gas-snapshot-check` in CI; Moderato measurements; set `fillsCap` and walk
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

## Handoff

S2.0–S2.3 done (ABI frozen at `engine-abi-v1`; storage, book, MatchLib). Next: S2.4 EventsEngine.
