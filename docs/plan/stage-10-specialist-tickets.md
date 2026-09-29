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

## Handoff

- 10.0 done (guard live at `0xaCA8…47B1`). Next: 10a Parlay / 10b Range — `src/products/{parlay,range}/*`,
  `RangeMath.sol` + `RangeMath.t.sol` and `packages/core/src/range/` landed with 10.0 (FairValue reuses Φ, √, Φ⁻¹);
  the parlay files are in progress in the worktree (uncommitted).
