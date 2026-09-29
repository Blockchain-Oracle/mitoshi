# Hosting on Coolify (D-061)

Self-hosted **Coolify 4.3.23** on the owner's server `agari-box` (84.46.247.92). The Coolify API/dashboard is reached
through an SSH tunnel: `ssh -f -N -L 8001:localhost:8000 agari-box` (CLI context `agari-new` = `http://localhost:8001`).
Apps are public through Coolify's proxy on 80/443.

## Project `mitoshi` (uuid `ktcbykphojha86g1oz1fjt78`)

| Environment | Resource | Kind | uuid | Domain (after `mitoshi.xyz` is bought) |
|---|---|---|---|---|
| testnet | `mitoshi-web-testnet` | app, Dockerfile `/web/Dockerfile`, port 3000, health `/api/health` | `vhxmiwhhjhngikv2ut5mqjio` | `https://testnet.mitoshi.xyz` |
| testnet | `mitoshi-ops-testnet` | app, Dockerfile `/services/ops/Dockerfile`, port 8080, health `/health` | `8iaimzcz5gcmont5hqbm6yhk` | `https://ops.testnet.mitoshi.xyz`, `https://stream.testnet.mitoshi.xyz` |
| testnet | `mitoshi-testnet-db` | PostgreSQL | `j9uqt80ux3ajxyaer5t5psfj` | internal only |
| testnet | `mitoshi-testnet-redis` | Redis (passkey challenges, sessions; replaces Upstash) | `3mpjtxc1cofmctbfnufzjwvg` | internal only |
| mainnet | web, ops, Postgres, Redis | created at S19 with the owner's go | — | `https://mitoshi.xyz`, `ops.mitoshi.xyz`, `stream.mitoshi.xyz` |

`mitoshi.xyz` registered 2026-09-29 (Namecheap BasicDNS; A `@`, `www`, `testnet`, `*.testnet`, `ops`, `stream` → 84.46.247.92). Testnet apps carry their domains; certificates issue once DNS propagates. The `sslip.io` addresses remain as fallbacks. Passkey rpId = `mitoshi.xyz`
(both networks), so the S1 passkey gate needs the real domain.

Source: private repo `Blockchain-Oracle/mitoshi`, branch `integration/t1`, read-only deploy key `mitoshi-deploy-key`
(`gxhdukuhxrh5taztpi5jzb24`). Images build from the repo root (Agari's pattern: cached pnpm store, `curl` for
Coolify's health check).

## Deploying

- Now: `coolify deploy uuid <app-uuid>` through the tunnel (as Agari deploys).
- Push-to-deploy needs a trigger GitHub can reach; the Coolify API is not public. Options are recorded in
  `docs/plan/owner-actions.md` (owner decides).
- Env vars: `coolify app env create|sync <uuid>`; names per `infra/env/*.example`; values never in git.
