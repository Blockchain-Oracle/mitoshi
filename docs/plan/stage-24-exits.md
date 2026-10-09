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
- [x] 24.2 v1 → v2 migration: withdraw-from-v1 in the account drawer; the settler's `crankSettle` covers v1 owners; the
  indexer reads both vaults (D-161); relay `vaultPolicy` for both; both addresses in codegen; S23d's sell lane works on
  v1 and v2; v2 becomes the default once v1 holds nothing new.
  Done (450be0a and this commit): the vault projections are keyed by vault (index/0004, rebuilt from both deploy
  blocks), the indexer follows v2 and v1 with a cursor each, and the settler cranks each owner's Window on the vault
  that booked it. Proven on real Moderato logs, including v2's identical history kept apart. The app's current vault
  is v2 (`vaultDeploymentOf`): new deposits, grants and trades go there; the balance sheet reads it; Trading
  Balance positions from both vaults are listed, each sold on its own vault (a v1 position is the owner's own sale;
  Trail/TP/SL refuse it). "Your previous Trading Balance" (Account, /portfolio) stops an old key and withdraws what v1
  holds. Both relay policies are in place (ba26081). `GrantKind` gains `exit` (the trust surface names it).
- [x] 24.3 The `exit-keeper` actor (`services/ops/src/actors/exit-keeper/`): trigger records written through
  `web/src/app/api/exits/route.ts` into a `packages/db` migration (user signature, nonce, expiry, cancel, idempotency per
  trigger); watches the display feed and the book; sells through `exitFor` under the EXIT grant within the floor
  (`placeFor` refuses an EXIT grant); pays its own gas (`sendOps`); publishes on `user:<addr>` ("Trailing stop hit ·
  BTC · Locked +$x"); restart safe; non-critical heartbeat.
  Built (D-209): the trigger and the exit rules in `@cwf/core/exits` (the tab's rules moved there — one copy);
  `exits/0001` (one row per position, nonce compare-and-set, claim before send, the hash stored once signed);
  `/api/exits` (POST verified by `verifyExitTrigger`, GET the owner's own); `@cwf/markets/ops` exits reads (holdings,
  Window, book, EXIT grant, `exitFloorRaw`, the floor rounded up onto the grid, `exitFor`, the booked sale); the actor
  steps trails on every display tick, reads what Close pays for TP/SL, backs a failed sale off, and settles a leftover
  claim from its receipt after a restart. Tests: trigger shape and rules, the signature check, the store on real
  Postgres, the limit never under the floor on either side, the keeper's decisions. Waits on the live check (a trigger
  fired on Moderato with no tab open, a restart mid-sale, a sale below the floor refused) before the box is ticked.
  Done (acceptance/S24.md): on Moderato the keeper sold a take-profit and a trail with no tab (BTC #2771, 0x6b8b…8d00,
  0x2c91…2be2, self-paid), an armed trail survived an ops restart, a stranger's trigger was refused and a sale under the
  floor reverted. Found on the way: the read chain can't verify P-256 (ae2aa40); the floor drifts with the block's clock
  (the limit leads it, 42c498a); in a book wider than the tolerance the floor refuses (the drawer says the keeper waits);
  RedStone's gateway shutdown (D-210).
- [x] 24.4 The house's exit tail (D-194, D-204): `seed-maker/{quote,lanes,window,index}.ts`. Both sides stay from
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
  Done (ops fbb4e48; `acceptance/S24.md`): BTC/crypto24/5m #2972. The full pair kept resting into the tail, then one
  half-size tail requote at lock − 61. Nothing new was placed from lock − 45, and both sides were gone at lock − 27
  (lapsed, no cancel). CI run 37951646703 closed Down ETH at lock − 60, inside the tail: "Realized −$0.57 · $0.40
  paid" in 2.0 s, 0 prompts (the driver now times its CLOSE there, d1bc1bc).
- [x] 24.5 Terminal: Trail/TP/SL switch to the keeper ("Runs with the app closed"); the EXIT grant's one passkey prompt
  in the Trail/TP/SL drawer ("Keep exits running with the app closed"); a row in `GrantsSection` with revoke.
  Built: the TP/SL drawer says where its exits run — "Runs with the app closed" (the keeper, at the grant's tolerance),
  "Keep exits running with the app closed" (one passkey confirmation: `vault-grant-exit`, root-signed, never
  sponsored; 15 %, 30 days) or "Runs only while Mitoshi is open"; Set and TRAIL write the position's whole trigger
  (the session key signs, `signExit`, no prompt); the tab never fires a position the keeper runs; the keeper's `exit`
  becomes the "… hit · BTC — Sold for $x · Locked +$y — with the app closed" toast; Grants lists the EXIT grant as
  sell-only with its tolerance and Stop. The keeper's address comes from ops `/exits/keeper`. Test: where a position's
  exits run (`server-exits.test.ts`). Live (2026-10-09, `acceptance/S24.md`): CI `trading-balance` run 37924296152
  (web b8ae2f6, ops fdc7062). The EXIT grant from the drawer took 1 assertion. A SOL bracket was written from the
  terminal with 0 prompts, and its stop-loss was sold by the keeper with the tab closed 20.6 s later. The EXIT and
  session grants were each stopped from `/settings/account` with 1 assertion. Also: a sale made while the app was
  closed is announced on the next visit (`missedSales`, by transaction), and `/api/exits` names each row's asset.
- [x] 24.6 Q-033 (c), D-213: the EXIT floor is the fair value less the wider of the tolerance share and an absolute
  slack (`grantExit(…, toleranceBps, slackBps)`, `exitSlackBps`, `BadSlack` over 15¢); EventVaultV2 redeployed on
  Moderato with the old address in `history[]`, and every vault list reads the history (previous balances, indexer,
  settler, relay targets); the drawer and Grants say "15% or 10¢, whichever is more"; index/0005. Tests: the floor
  formula fuzzed on both sides; F-S24-01's shape (the share alone refuses at a bid 6.4¢ under a ~41¢ fair, the slack
  sells at the bid); the bound; the index on real Postgres; the retired vault's area and targets. Live check: the CI
  `trading-balance` keeper step brackets SOL's cheap side and passes only on a sale.
  Done (d9aba5e, fbb4e48; `acceptance/S24.md`): `0xdbb3…2040` on Moderato (block 38,862,004), `0x6f05…9e95` in
  `history[]`; ops and web on fbb4e48, the indexer following all three vaults. CI run 37948666312 passed every step.
  Its keeper sold a stop-loss on SOL's cheap side 58.1 s after the tab left, at 21.3¢ a contract against a fair of
  28.6¢: under the 15 %-only floor (24.3¢), over the slack's (18.6¢). That is a sale the contract refused before. The
  previous vaults withdraw through the deployed relay and are cranked by the settler (`previous-vaults-live.ts`).
- **Gate: passed 2026-10-09** (`acceptance/S24.md`). Trail fired with the tab closed, a restart survived, a sale
  under the floor reverted (24.3). Revoked from `/settings/account` (24.5, and runs 37948666312 / 37951646703). The
  previous balances withdrew through the deployed relay and their positions were cranked by the settler, for v1 and
  the retired v2 (`previous-vaults-live.ts`). House bids were visible to lock − 30 and gone after (#2972). Every tx
  is checked with `cast receipt`. Since D-213 a cheap-side stop-loss sells (runs 37948666312 and 37951646703, both
  under the old floor).
- Gate as planned: on Moderato the keeper fires a trail with the tab closed, survives a restart, honours the proof
  floor (a sell below it reverts), and is revoked from `/settings/account`; v1 balances withdraw and v1 positions
  crank; house bids visible until T−30 s and gone after; every tx in `acceptance/S24.md` after `cast receipt`.
  **Rows:** RV-51, RV-55, RV-97, RV-98, UX-19.

## Findings

- **F-S24-01 (2026-10-09), a stop-loss on a cheap side waits under the floor.** CI run 37920856259: a Down BTC's
  stop-loss was written from the terminal. The keeper fired it at 11:07:12 (#22), then refused to sell nine times until
  the Window ended: "no bid at or above the floor (35.6¢ … 18.3¢)", plus one `ImmediateOrCancelNoFill` against a
  vanishing bid. The side was worth about 41¢, so its 15 % floor sat about 6.2¢ under fair. The house's half-spread
  was about 6.4¢, widened by the divergence guard spanning the display and signed fairs. Take-profits fire on dear
  sides and cleared on the first try (24.3). The floor kept D-193's promise; whether to change it is Q-033. The same
  run found triggers outliving their Window as `armed`, now ended `expired` with the last reason (4acbdf8).

## Handoff
