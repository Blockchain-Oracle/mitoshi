# Fly (plan C.6)

Two apps, `cwf-ops-testnet` and `cwf-ops-mainnet`, one machine each, `/data` volume, `node:24-slim`
(`services/ops/Dockerfile`, `fly.<network>.toml`). `DRY_RUN=1` until an actor is rolled out. Secrets per
`env/ops.<network>.example` and `secrets.md`. Deploys: `deploy-ops.yml` (testnet on push to main; mainnet only by hand,
with the owner's go). Health: `GET /health` (200 when every actor has a recent good pass).
