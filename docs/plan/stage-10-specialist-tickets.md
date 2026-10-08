# S10 — Specialist tickets (10.0/10a–c after S4 + S8 depth; 10d after S7; separate worktrees; A.4.3–A.4.7, A.5.4)

> **Revamp (2026-10-08, D-189…D-200):** Range's band is drawn on the terminal chart; Boost, Moonshot, Parlay and Private also run as terminal modes (S23i) while their routes stay.

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
- [x] 10e `/surface` (31861 table + 30538 sparklines); 10d desk from the 27122 swap-ticket layout; web tickets + relay policies per reserve; `/api/prices/{redstone-payload,datastreams-report}`.
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
- F-S10-10 (10b.1, contracts): `RangeReserve`/`RangePricing`/`IRangeReserve` ported onto the engine seam (D-172);
  runtime 15,502 B. Masayume's lifecycle 10 + pricing 11 + RangeMath 6 + vectors 1 + Moonshot 2 run on the real engine
  (a real open print at P0, a real maker's rested book, real closes and voids); the seam suite adds 16
  (`test_mustSettle` ×2, `test_staleBasis_driftAbove2Sigma` + 2, `test_centerScale_derivesFromGrid`, rested centre,
  `test_bandInclusiveCentsAtSeam` ×4, a Moonshot round, P12 ×3, constructor); the Moderato fork test prices a ±$100
  band on the archived BTC 06:10Z open and settles it on the real 06:15Z close. On the engine's tick grid Masayume's
  0.841345 centre becomes 0.8415 (vector re-derived exactly); the mock's "answer then clear" stale case has no engine
  equivalent (a verdict is final), so it split into the grace test and `test_mustSettle`.
- F-S10-11 (10c.1, contracts): `LeverageReserve`/`LeverageGateway`/`LeverageMath`/`ILeverageReserve` ported onto the
  engine seam (D-174); runtime 21,629 B. Masayume's open 19 + lifecycle 15 + vectors 2 run on the real engine (a real
  maker's book, the reserve's own engine position, real closes and voids; the engine's 0.001 lot sizes DOWN to 45.714
  where Masayume's 0.01 lot gave 45.71); the seam suite adds 14 (D-114 at birth ×3, knock-out over rested depth,
  pay-or-owe exits, `LyingEngine` accounting ×2 covering five buy lies, a short sale and a short redemption; D-116 ×2;
  PD-2 entry ceiling, knock-out second test, proof freshness; P12; constructor); the Moderato fork test opens a 2×
  boost on the archived BTC Window, refuses a knock-out into a rested lowball bid because the real packages price the
  position healthy, and settles it on the real close. Two Masayume tests change with D-114: a knock-out on a book too
  thin for the whole position refuses instead of selling part; the pool's "refund as credit" knob is the engine's
  `sweep`, which finds nothing (a taker never accrues credit). The mock's taker fee has no engine equivalent (T10).
- F-S10-12 (10c.2, deploy): Tempo creation gas runs ≈ 1,000 gas per runtime byte plus 250k per fresh slot: ParlayReserve
  (13.1 KB) 16.4M, RangeReserve (15.5 KB) 19.4M, LeverageReserve (21.6 KB) 24.8M — against Moderato's 30M transaction
  cap. Forge's default 130 % estimate multiplier put the leverage create at 32.9M and the node refused it before
  sending; `--gas-estimate-multiplier 110` deployed it. A product past ≈ 24 KB runtime cannot deploy in one transaction
  at all, a tighter bound than the 23.5 KB size rule for anything with a heavy constructor.
- F-S10-13 (10d.1, contracts): `PrivateDesk`/`PrivateGateway`/`IPrivateDesk` ported onto the engine seam (D-176);
  runtime 13,035 B. Masayume's budget 9 + lifecycle 9 run on the real engine (the engine's 0.001 lot: 10 at 0.60 buys
  16.666 for 9.9996; Masayume's 0.01 lot bought 16.66 for 9.996); the seam suite adds 8 (D-117 credit-needs-budget ×2,
  the three counters at every step with a dishonest over-credit, `LyingEngine` mint ×5 lies and settlement, P12, the
  sweep, constructor); the three-counter invariant (128 × 200, random owners, dishonest desk credits, prints and
  voids) holds the wallet identity, both sub-sums and engine position = unsettled slots, and `afterInvariant` empties
  the desk to zero; the Moderato fork test opens, settles on the real close, sweeps, credits and withdraws. One Masayume
  line changes with D-117: the desk crediting itself refuses `NoBudget` before the pool is consulted.

## Handoff

**Merged into `integration/t1` at `3e917a4` (2026-10-08); the branch and its worktree are gone.** Since this handoff:
`9866e14` 10c.3 Boost placed card + Range/Moonshot "at most" + browser rows · `6547f69` 10d.4 private web (D-171) ·
`e71267a` 10e `/surface` (in progress) · `2b5b053` the trunk's gate fixes. History: branch `stage/S10-tickets` (merged with trunk 58d1277 at 71fbdb3). Commits: `b721516` 10a.1 parlay contracts + suites ·
`9a26db6` 10a.2 ParlayReserve live + `deployer-tickets` + parlay relay policy (D-166) · `e226eb2` 10a.3 `/parlay` slip,
`packages/markets/src/parlay`, `/api/prices/redstone-payload` (D-167) · `570e148` drive fix · `f2bc39e` merge of
`slice/S10bcd-contracts` (10b.1–2 range, 10c.1–2 leverage + leverage-keeper, 10d.1–2 private: contracts, suites,
Moderato deploys, relay policies, D-172…D-177) · `71fbdb3` trunk merge.

- **Live on Moderato** (all by `deployer-tickets` 0x5DFC…41E8): ParlayReserve `0x57baD0Beb33C8f8557Dc7430F90Ba166587f3939`,
  RangeReserve `0xf19342733Bb451503f3806b0d44CC58A3D345052`, LeverageReserve `0x1c623E5539351C01FB193f962C7502cCcFd9206D`,
  PrivateDesk `0x0c894dB5057E18F5C9E09C72faAc0b6098613CD8` (desk = the `desk` role). Only the three crypto 5m lanes have
  a σ + spot source in the guard, so they are the lanes these products can price today.
- **10a Parlay:** browser gate passed once at 390 px (`web/e2e/parlay.ts`: sign-up, two legs, hold to place — 1 prompt,
  sponsored — settle in close order, the ticket lost honestly); the drive `scripts/drive/parlay-live.ts` keeps the S8
  maker vault quoting 20 a side on every crypto 5m Window (`maker`), and has `open`, `settle`, `refusals` modes.
  Remaining for 10a.4: a won ticket claimed, the refusals recorded, the UX gate at 320/390/768/1440 both themes.
- **Next, in order (sequential, one worktree):** 10b Range + Moonshot web (`packages/markets/src/range`, `/games/range`,
  `/games/moonshot`, band on the hero chart, 31347 + 32784 selector), 10c Boost web (29217 slider in the ticket, Boost
  positions, keeper), 10d Private desk service + web (server-side claims per account, committed secret, 27122 desk),
  10e `/surface` (31861 + 30538) + `/api/prices/datastreams-report`, then the stage gate (each product opened on
  Moderato against S8 depth with a real RedStone spot, thin books refused by name, UX gate on every ticket).
- Local gate setup: containers `s10-pg` (:55441) and `s10-redis` (:56391), a gitignored `web/.env.local` (relay fee
  payer from `~/.config/cwf/testnet/relay-fee-payer.json`, `NEXT_PUBLIC_INDEX_URL` → a CORS pass-through to
  `testnet.mitoshi.xyz/api/index` on :3199), `next dev -p 3110`.
- 2026-10-08 (trunk): `/api/prices/datastreams-report?symbol=&t=` — the Data Streams sibling of the RedStone payload
  route: the venue's streams (equities RegularHours v11, crypto v3; `DATA_STREAMS_FEEDS`), latest or the report covering
  `t`, HMAC on the server, `marketStatus` for v11; without credentials it answers 503 `datastreams-unconfigured` (Q-011),
  never a made-up report. 10e complete; the register gained the 31861/30538 rows. Left for S10: 10a.4 (a won ticket
  claimed, refusals recorded, UX gate at 320/390/768/1440 × both themes), the browser gates for 10b–10d, the stage gate.
