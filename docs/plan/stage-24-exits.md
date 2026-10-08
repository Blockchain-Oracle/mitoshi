# S24 — Exits with the app closed and the house's last minute (after S23; money gate; D-193, D-194, D-200)

On `integration/t1` (D-201). Contracts follow plan §4 (Foundry ≥ 1.8.3, `network = "tempo"`, pay `msg.sender` only,
receive-policy pre-check on every payout, no `payable`, no CREATE in any flow an access key signs). Ledger rows RV-51,
RV-55, RV-97, RV-98.

- [ ] 24.1 EventVault v2: the EXIT grant kind (sell-only, no budget path, separate from EXECUTOR/STRATEGY) in a split
  `contracts/src/products/vault/VaultExits.sol` (EventVault is 384 lines); each keeper sell carries a floor of
  `FairValueGuard.fairUpE6(m, RedStone proof)` less the stated tolerance (never `previewFairUpE6`); `OpenPrintMissing`
  and `SigmaNotSet` refuse; Foundry unit + invariant tests (`afterInvariant`), gas snapshot, `forge build --sizes` in
  both profiles; ops sets σ for every Series the terminal trades; deploy on Moderato; codegen.
- [ ] 24.2 v1 → v2 migration: withdraw-from-v1 in the account drawer; the settler's `crankSettle` covers v1 owners; the
  indexer reads both vaults (D-161); relay `vaultPolicy` for both; both addresses in codegen; S23d's sell lane works on
  v1 and v2; v2 becomes the default once v1 holds nothing new.
- [ ] 24.3 The `exit-keeper` actor (`services/ops/src/actors/exit-keeper/`): trigger records written through
  `web/src/app/api/exits/route.ts` into a `packages/db` migration (user signature, nonce, expiry, cancel, idempotency per
  trigger); watches the display feed and the book; sells through `placeFor(isBuy=false)` under the EXIT grant within
  the floor; pays its own gas (`sendOps`); publishes on `user:<addr>` ("Trailing stop hit · BTC · Locked +$x"); restart
  safe; non-critical heartbeat.
- [ ] 24.4 The house's exit tail (D-194): `seed-maker/{quote,window}.ts` keep only the bid side from T−75 s to T−30 s,
  short-TTL requotes, wider spread, inventory and spread caps, the house capital named; the lock−30 cap and the Regular
  session-close pull stay; tests for both rules.
- [ ] 24.5 Terminal: Trail/TP/SL switch to the keeper ("Runs with the app closed"); the EXIT grant's one passkey prompt
  in the Trail/TP/SL drawer ("Keep exits running with the app closed"); a row in `GrantsSection` with revoke.
- **Gate:** on Moderato the keeper fires a trail with the tab closed, survives a restart, honours the proof floor (a
  sell below it reverts), and is revoked from `/settings/account`; v1 balances withdraw and v1 positions crank; house
  bids visible until T−30 s and gone after; every tx in `acceptance/S24.md` after `cast receipt`. **Rows:** RV-51,
  RV-55, RV-97, RV-98, UX-19.

## Findings

## Handoff
