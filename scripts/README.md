# scripts

| Dir | What | Stage |
|---|---|---|
| `codegen/` | `clients.mjs`: deployment fragments → `packages/clients` | S0.6 |
| `invariants/` | Repository rules (`pnpm invariants`) | S0.7 |
| `keys/` | Key generation and Moderato funding (addresses only in acceptance) | S0.10 |
| `deploy/` | Deploy wrappers: forge script → fragment → codegen | S2 onward |
| `drive/` | Live drives on Moderato whose tx hashes go into acceptance | S2 onward |
| `v4/` | Uniswap v4 replay onto Moderato, its verification, encoder golden vectors, sub-gate (sends via `cast`) | S15a |
| `archive/` | Print-archive import and overlap checks | S0.11 |
| `e2e/` | Playwright passkey and browser runs | S1 onward |
| `perf/` | Route budgets and Lighthouse CI config | S1 |
