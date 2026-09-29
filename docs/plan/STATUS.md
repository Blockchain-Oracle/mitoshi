# STATUS — the resume pointer (read after working-rules.md)

Updated 2026-09-29. **Never trust memory over this file.**

## Where we are

- Plan v5 approved by the owner on 2026-09-29 (`00-plan.md`; specs in `docs/specs/`).
- Branches: trunk `integration/t1`; current `stage/S0-bootstrap`.
- Current stage: **S0 — Bootstrap** (`stage-00-bootstrap.md`). Done: S0.1–S0.8, S0.10 (Moderato part), S0.12, S0.13.
  Open: S0.9 hosting, S0.10 Robinhood/Base testnet ETH, S0.11 archive takeover (needs Neon + Fly), the gate.
- Verified so far: pnpm workspace builds and typechecks; ops reads Moderato live (`/health`, also in Docker); Foundry
  1.8.3 both profiles; codegen pipeline proven on `anvil --network tempo`; invariants catch planted violations;
  12 testnet role keys funded (addresses in `acceptance/S0.md`).

## Waiting on the owner

See `owner-actions.md`. Blocking S0's gate: the domain + hosting accounts (Q-019, Q-026) and the Robinhood testnet
faucet claims (X11).

## Next up

S0 steps in order; then wave 1 (S1 · S2 · S14c · S15a + S17a) per plan §7.
