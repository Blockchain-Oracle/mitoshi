# Secrets — names and where they live (never values)

| Name | Where | Used by |
|---|---|---|
| `RELAY_FEE_PAYER_PRIVATE_KEY` | Coolify web app (per network) | `/api/relay` fee payer |
| `DESK_PRIVATE_KEY` (the `desk` role; testnet `~/.config/cwf/testnet/desk.json`) | Coolify web app (per network) | `/api/private/*` desk service: signs claims, pays its own sends (D-171) |
| `<ROLE>_PRIVATE_KEY` (roller, price-relay, settler, seed-maker, earn-quoter, keeper, x-relay, desk, stock-sync, ops-fee-payer) | Coolify ops app env (per network); locally `~/.config/cwf/<network>/<role>.json` | ops actors |
| `DEPLOYER` key | local `~/.config/cwf/<network>/deployer.json`; mainnet via the owner's hardware wallet / Safe | forge scripts |
| `MPP_PAYER_PRIVATE_KEY`, `MPP_ROOT_ADDRESS` | Coolify ops (testnet: roles `mpp-payer`/`mpp-root` in `~/.config/cwf/testnet/`; mainnet after Q-020) | MPP payer (TIP-1011 access key on the root), brain `via: 'mpp'`, paid data |
| `MPP_SECRET_KEY` (≥ 32 bytes, `openssl rand -base64 32`; runtime-only) | Coolify web (per network) | mppx server: HMAC-binds the Memory Market's paid-read challenges (S9.9b) |
| `THEME_KEY_KEK` | Coolify ops (testnet); KMS on mainnet | theme agent keys |
| `OPS_INTERNAL_TOKEN`, `STREAM_TICKET_SECRET` (testnet ops: generated 2026-09-29, runtime-only; the web's `/api/stream/ticket` needs the same value), `ROOM_TOKEN_SECRET`, `SOCIAL_SESSION_SECRET` | Coolify web + ops | internal auth, stream tickets, rooms, social session |
| `DATABASE_URL` | Coolify web + ops | Coolify Postgres per network |
| `REDIS_URL` | Coolify web + ops | Coolify Redis (passkey challenges, sessions) |
| AI provider keys (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — either one is enough, D-221 — or `AI_GATEWAY_API_KEY`, or `AI_BASE_URL` + `AI_API_KEY`) | Coolify web + ops (testnet 2026-10-11: `OPENAI_API_KEY` — the owner's key Agari runs on, copied app to app from `agari-ops`, runtime-only, never shown) | Sensei (`/api/sensei`), agents; `SENSEI_VIA=mpp` pays Sensei through the MPP payer instead (web then needs `MPP_PAYER_PRIVATE_KEY` + `MPP_ROOT_ADDRESS`); `SENSEI_MODEL` / `AI_MODEL` override the default (`anthropic/claude-opus-5-5` with its key, else `openai/gpt-6-sol`) |
| X OAuth + rettiwt cookies | Coolify ops | x-relay |
| `FINNHUB_API_KEY`, `ALPACA_*`, `DATASTREAMS_API_KEY/SECRET`, `TEMPO_INDEXER_API_KEY` | Coolify web + ops (testnet ops: the owner's Alpaca + Finnhub keys, the same ones Agari uses, set 2026-09-29 runtime-only; testnet web: `FINNHUB_API_KEY` copied app to app from ops 2026-10-10 for `/news`, runtime-only, never shown) | data providers (calendar, halts, earnings) |
| `TIDX_URL`, `TIDX_BASIC_AUTH` | Coolify ops (when a self-hosted tidx is chosen, D-086) | indexer recount |
| RPC provider URLs (`TEMPO_RPC_*`, `RH_RPC_HTTP_URL`, `BASE_SEPOLIA_RPC_HTTP_URL`) | Coolify web + ops + GitHub Actions | chain reads |
| APNs `.p8` + key ID + team ID, FCM service account | Coolify ops | notifier (SM2) |
| Reown project ID | Coolify web | WalletConnect |
| EAS token, Android upload keystore (EAS-managed) | GitHub Actions / EAS | mobile builds |
| Coolify API token | local CLI context only (never in GitHub unless push-to-deploy option (b) is chosen) | deploys |

Rules: never print or commit a value; `redact()` in ops scrubs known secrets from logs; keys are 0600 files locally.
