# S2 — The market engine (wave 1) — money gate (App. A)

- [ ] S2.0 Toolchain check + `script/check-sizes.sh` (fail > 23.5 KB); spikes X6, X7.
- [ ] S2.1 **Interface checklist, signed before freeze:** `docs/specs/interface-checklist.md` — every IDreamDex member
  (A.2.7), the 12 engine semantics, E-01…E-72, and the reads C.2.5 needs (batch `marketsOf`, `positionsOf`,
  `topOfBook`), each mapped to a function and a test; signed by the S4/S7/S8/S10/S12b owners. Freeze
  `docs/specs/engine.md` with the deviation register T01–T10 (A.7). Compile-only interfaces
  `src/engine/interfaces/{IEventsEngine,IEngineLens,IPrintVerifier,IEventsEngineEvents}.sol`, `EngineTypes.sol`,
  `EngineErrors.sol`; tag `engine-abi-v1` (seams can start).
- [ ] S2.2 `EngineStorage.sol`, `libs/{BookLib,Grid,PositionLib}.sol`. Src: Agari `book/{ladder,slab}.rs`, `grid.rs`,
  `matching/{paths,seats}.rs`. Tests `Book`, `HolderList`, `Grid`.
- [ ] S2.3 `libs/MatchLib.sol`. Src: `matching/{engine,place,evict,orders}.rs`. Tests `Paths`, Examples 1–7, `Edges`,
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

_None yet._

## Handoff

_Not started._
