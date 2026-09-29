# Shared files and fragments (plan §4 "Shared files", Appendix C.1.6)

Parallel agents never edit the same file. Each area owns its fragment:

| Kind | Path | Owner |
|---|---|---|
| Deployments | `contracts/deployments/<chainId>/<area>.json` (schema in `contracts/deployments/README.md`) | the stage deploying the area |
| Acceptance evidence | `docs/plan/acceptance/S<n>.md` | the stage |
| Chain I/O | `packages/markets/src/<area>/` | the stage |
| Relay policy | `packages/markets/src/relay/policies/<area>.ts` | the stage adding sponsored calls |
| DB migrations | `packages/db/migrations/<area>/NNNN_*.sql` | the stage |
| Components register | `docs/design/components.md` (append-only rows) | any UI step |

`packages/clients` is generated from the deployment fragments (`pnpm codegen`); never edit it by hand. Dependencies are
installed in S0 so later stages don't touch lockfiles concurrently; one integrator merges stage branches into
`integration/t1`. Worktrees live in `../cwf-wt/<name>`; branches `stage/S<n>-<slug>`, lanes `slice/S<n><x>-<slug>`.
