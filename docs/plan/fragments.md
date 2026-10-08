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
`integration/t1`. **Since D-201 (2026-10-08) every stage runs sequentially on `integration/t1` itself: no worktrees, no
stage or slice branches, no parallel lanes.** (Earlier stages used `../cwf-wt/<name>` worktrees and `stage/S<n>-<slug>`
branches; their history is in the trunk under each `merge(S…)` commit.)
