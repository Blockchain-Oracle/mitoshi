# S10 — Specialist tickets (10.0/10a–c after S4 + S8 depth; 10d after S7; separate worktrees; A.4.3–A.4.7, A.5.4)

- [x] 10.0 `src/fair/{FairValue,FairValueGuard}.sol` + `packages/core/src/fair/fair.vectors.json` (from Agari
  `seat/fair.ts`) + tests.
- [ ] 10a Parlay: `src/products/parlay/*`; Masayume's lifecycle, pricing and vector suites + D-108, L-38, D-109, PD-2 tests;
  slip composed from 21st 109 + 24524 + the 16240 ticket (weak coverage, E.4).
- [ ] 10b Range + Moonshot: `src/products/range/*` minus `WindowQuestion`; Masayume's lifecycle, pricing,
  RangeMath, vector and Moonshot suites + `test_mustSettle`, `test_staleBasis_driftAbove2Sigma`,
  `test_centerScale_derivesFromGrid`, `test_bandInclusiveCentsAtSeam`; band drawn on the hero chart; range selector from 21st 31347 slider over 32784 distribution bars.
- [ ] 10c Boost: `src/products/leverage/*`; Masayume's open, lifecycle and vector suites + D-114, D-116,
  PD-2 tests; leverage-keeper; leverage slider from 21st 29217 (or 11664).
- [ ] 10d Private: `src/products/private/*`; Masayume's budget and lifecycle suites + D-117 + the three-counter
  invariant; private claims stored server-side per account (the reference's browser-only claims break in the app); desk
  service (P-256-safe committed secret, C.2.4).
- [ ] 10e `/surface` (31861 table + 30538 sparklines); 10d desk from the 27122 swap-ticket layout; web tickets + relay policies per reserve; `/api/prices/{redstone-payload,datastreams-report}`.
- **Gate:** each product opens on Moderato against S8 maker depth using a real RedStone spot payload; thin books refused
  honestly; UX gate on every ticket. **Rows:** L-36, L-37, L-38, L-39, L-40, L-67.

## Findings

- F-S10-01: the first S10.0 live run found no crypto Window with an open print: the Coolify box (`agari-box`) hit
  load average ≈ 184 and ops restarted; Windows 570–572 locked with `openE8 = 0`. Prints resumed on the next cycle and
  the run passed. Drives that need an open print should say so by name rather than wait silently.
- F-S10-02 (10a.1, contracts): the uncommitted parlay port reviewed against Masayume 68f7a09 and A.4.6 and kept: lens
  status/payouts, rested-only `_bookPrice` (D-109), `BelowFairValue` per leg on a same-call spot (PD-2), `LegOutOfOrder`
  (D-108), `lockedByExpiry[E]` released per decided boundary (L-38), void refund and claim via `_payOrOwe` (P12).
  ParlayReserve runtime 13,104 B. Masayume's lifecycle 11 + pricing 12 + vectors 2 run on the real engine with the
  book seeded by a real maker (`ParlayTestBase` on `BookSeeder`); the seam suite adds 17 (D-108 ×3, L-38 ×3, D-109 ×3,
  PD-2 ×4, P12 ×3, constructor); the Moderato fork test prices off a rested book, bounds on the archived BTC packages,
  wins the 5-minute leg on its real close and voids the 10-minute one. The engine derives status from the clock, so
  `LegExpired` is unreachable behind `MarketNotTrading(…, LOCKED)`; the mock's "(1, 1) names no winner" vector does
  not exist on the engine (its void is 0.5/0.5 and a tie settles Up), so that test now proves both. D-165.

## Handoff

- 10a.1 done: parlay contracts + suites + `script/products/DeployParlayReserve.s.sol` (launch params, D-165). Next:
  10a.2 deploy on Moderato with `deployer-tickets` + `relay/policies/parlay.ts`; 10a.3 `packages/markets/src/parlay`
  + the `/parlay` slip (E.4); 10a.4 the live gate against the S8 maker vault's depth.
- 10.0 done (guard live at `0xaCA8…47B1`). Next: 10a Parlay / 10b Range — `src/products/{parlay,range}/*`,
  `RangeMath.sol` + `RangeMath.t.sol` and `packages/core/src/range/` landed with 10.0 (FairValue reuses Φ, √, Φ⁻¹);
  the parlay files are in progress in the worktree (uncommitted).
