# S24 — Exits with the app closed and the house's last minute (after S23; money gate; D-193, D-194, D-200)

On `integration/t1` (D-201). Contracts follow plan §4 (Foundry ≥ 1.8.3, `network = "tempo"`, pay `msg.sender` only,
receive-policy pre-check on every payout, no `payable`, no CREATE in any flow an access key signs). Ledger rows RV-51,
RV-55, RV-97, RV-98.

- [x] 24.1 EventVault v2: the EXIT grant kind (sell-only, no budget path, separate from EXECUTOR/STRATEGY) in a split
  `contracts/src/products/vault/VaultExits.sol` (EventVault is 384 lines); each keeper sell carries a floor of
  `FairValueGuard.fairUpE6(m, RedStone proof)` less the stated tolerance (never `previewFairUpE6`); `OpenPrintMissing`
  and `SigmaNotSet` refuse; Foundry unit + invariant tests (`afterInvariant`), gas snapshot, `forge build --sizes` in
  both profiles; ops sets σ for every Series the terminal trades; deploy on Moderato; codegen.
  Done (5ba0e86, and this commit): `VaultExits` + `EventVaultV2` (`grantExit`, `exitFor`, `exitFloorRaw`; no budget,
  no `placeFor`), 7 tests incl. a fuzzed floor property, the full suite at 679; deployed on Moderato at
  `0x6f05…9e95` (`vault2.json`, codegen); the guard holds σ for all 66 Series (`guard-spec.json`, Regular on the
  trading year, 24/7 on the calendar year, the Gap's span carrying one session) and one spot feed per ticker
  (`---24_7` where RedStone has it) via `script/SetGuardModels.s.sol` (`acceptance/S24.md`). A sale's limit sits on
  the engine's tick grid, so the keeper rounds the floor up (24.3).
- [ ] 24.2 v1 → v2 migration: withdraw-from-v1 in the account drawer; the settler's `crankSettle` covers v1 owners; the
  indexer reads both vaults (D-161); relay `vaultPolicy` for both; both addresses in codegen; S23d's sell lane works on
  v1 and v2; v2 becomes the default once v1 holds nothing new.
- [ ] 24.3 The `exit-keeper` actor (`services/ops/src/actors/exit-keeper/`): trigger records written through
  `web/src/app/api/exits/route.ts` into a `packages/db` migration (user signature, nonce, expiry, cancel, idempotency per
  trigger); watches the display feed and the book; sells through `placeFor(isBuy=false)` under the EXIT grant within
  the floor; pays its own gas (`sendOps`); publishes on `user:<addr>` ("Trailing stop hit · BTC · Locked +$x"); restart
  safe; non-critical heartbeat.
- [ ] 24.4 The house's exit tail (D-194, D-204): `seed-maker/{quote,lanes,window,index}.ts`. Both sides stay from
  lock − 75. A pair already resting is kept. New placements are half the lots at twice the half spread. Nothing new is
  placed from lock − 45. The pair lapses at lock − 30 with no cancel, and a pair already resting to lock − 30 is never
  churned. Each Window is tended on the chain clock of its moment, and a placement with under 8 s to rest is skipped.
  A requote is one transaction (cancel, merge, the new pair), so no side goes missing between cancel and placement. It
  is priced against everyone's best but the maker's own (`othersTop`), and a batch that would revert falls back to one
  call at a time.
  Pulls still cancel. A rate-limited raw send goes again with the same bytes (`tx/send.ts`). The capital is the ops
  maker account under the `MM_*` per-Window caps. The lock−30 cap and the Regular session-close pull stay.
  Tests: `quote.test.ts` (phases, tail size and spread, minimum life, no churn, `othersTop`); `window.test.ts` (a
  resting pair kept, tail placements, full quotes before, stop vs pull, late placement skipped, the one-transaction
  requote and its fallback); `send-split.test.ts` (same-bytes retry,
  fail-fast). Live check: `scripts/drive/exit-tail-live.ts` shows both sides through a Window's tail, and the
  terminal-trade CI driver closes inside it (acceptance S23).
- [ ] 24.5 Terminal: Trail/TP/SL switch to the keeper ("Runs with the app closed"); the EXIT grant's one passkey prompt
  in the Trail/TP/SL drawer ("Keep exits running with the app closed"); a row in `GrantsSection` with revoke.
- **Gate:** on Moderato the keeper fires a trail with the tab closed, survives a restart, honours the proof floor (a
  sell below it reverts), and is revoked from `/settings/account`; v1 balances withdraw and v1 positions crank; house
  bids visible until T−30 s and gone after; every tx in `acceptance/S24.md` after `cast receipt`. **Rows:** RV-51,
  RV-55, RV-97, RV-98, UX-19.

## Findings

## Handoff
