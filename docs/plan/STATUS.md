# STATUS — the resume pointer (read after working-rules.md)

Updated 2026-09-29. **Never trust memory over this file.**

## Where we are

- Product: **Mitoshi 見通し** (`mitoshi.xyz`, D-060). Hosting: owner's Coolify (D-061, `infra/coolify.md`).
- Repo: private `Blockchain-Oracle/mitoshi`; trunk `integration/t1` (default); current `stage/S0-bootstrap`.
- **S0 and S2 gates passed.** On the trunk (e1ab0d3): S2 engine, S3 venue ops (live on Coolify, 24 h soak until
  2026-09-30 07:05Z), S3.5 clients, S14c bridge (RH legs wait for testnet ETH), S15a v4 + encoder, S15b/c guard +
  pools, S16c themes contracts (configured), S17a/b launchpads, S7 EventVault contracts, S1 up to 05990e6.
  Running: S1 web shell, S8 maker vault, S10 specialist tickets.
- Live on testnet (Coolify): `https://testnet.mitoshi.xyz` (web), `https://ops.testnet.mitoshi.xyz/health` with `chain-head` + `archive` (RedStone prints every
  5 min, < 60 s after T). 12 testnet role keys funded (`acceptance/S0.md`).

## Open integration items (from the wave-2/3 merges; owners pick these up)

- S1/S16: the relay engine doesn't honour `themesPolicy.batches` (the one-tx key-authorization + follow is refused).
- S4: register `relay/policies/engine.ts` (sponsoring engine trades is S4's call).
- S1/S7: `vaultPolicy` sponsors `placeFor` without the `asyncSender` grant check `relay/types.ts` expects.
- S3/S7: settler reports the vault as "tracked" but has no `crankSettle` work yet.
- S15: `reference-writer` reads `KEEPER_PRIVATE_KEY` from env only (not S3's `roleKey()` fallback); key missing from
  `ops.mainnet.example` / `infra/secrets.md`; `relay/policies/guard.ts` not yet registered.
- S17b: the launch keeper has no sender wired; S1: mount `/api/stream/ticket`; S3.5: `idx_events` counter in recount.

## Waiting on the owner

See `owner-actions.md`. Blocking S0's gate: buy `mitoshi.xyz` + DNS; Robinhood testnet ETH + faucet claims (X11); the
push-to-deploy choice. Wave 1 does not wait on these.

## Next up

S0 steps in order; then wave 1 (S1 · S2 · S14c · S15a + S17a) per plan §7.
