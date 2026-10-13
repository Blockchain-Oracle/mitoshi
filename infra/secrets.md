# Secrets — names and where they live (never values)

| Name | Where | Used by |
|---|---|---|
| `RELAY_FEE_PAYER_PRIVATE_KEY` | Coolify web app (per network) | `/api/relay` fee payer |
| `DESK_PRIVATE_KEY` (the `desk` role; testnet `~/.config/cwf/testnet/desk.json`) | Coolify web app (per network) | `/api/private/*` desk service: signs claims, pays its own sends (D-171) |
| `<ROLE>_PRIVATE_KEY` (roller, price-relay, settler, seed-maker, earn-quoter, keeper, x-relay, desk, ops-fee-payer) | Coolify ops app env (per network); locally `~/.config/cwf/<network>/<role>.json` | ops actors |
| `DEPLOYER` key | local `~/.config/cwf/<network>/deployer.json`; mainnet via the owner's hardware wallet / Safe | forge scripts |
| `MPP_PAYER_PRIVATE_KEY`, `MPP_ROOT_ADDRESS` | Coolify ops (testnet: roles `mpp-payer`/`mpp-root` in `~/.config/cwf/testnet/`; mainnet after Q-020) | MPP payer (TIP-1011 access key on the root), brain `via: 'mpp'`, paid data |
| `MPP_SECRET_KEY` (≥ 32 bytes, `openssl rand -base64 32`; runtime-only) | Coolify web (per network) | mppx server: HMAC-binds the Memory Market's paid-read challenges (S9.9b) |
| `KEEPER_PRIVATE_KEY` (the `keeper` role `0x6Ed3…ad0C`; `LAUNCH_KEEPER_PRIVATE_KEY` unset on testnet, so `launch-keeper` falls back to it) | Coolify ops (testnet); locally `~/.config/cwf/testnet/keeper.json` | `leverage-keeper`, `exit-keeper`, `launch-keeper` (expiring nonces). D-231 retired `reference-writer` and, with `theme-agent`, its `THEME_KEYS_SECRET` (unset it on the ops app) |
| `OPS_INTERNAL_TOKEN`, `STREAM_TICKET_SECRET` (testnet ops: generated 2026-09-29, runtime-only; the web's `/api/stream/ticket` needs the same value), `ROOM_TOKEN_SECRET`, `SOCIAL_SESSION_SECRET` | Coolify web + ops | internal auth, stream tickets, rooms, social session |
| `DATABASE_URL` | Coolify web + ops | Coolify Postgres per network |
| `REDIS_URL` | Coolify web + ops | Coolify Redis (passkey challenges, sessions) |
| AI provider keys (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — either one is enough, D-221 — or `AI_GATEWAY_API_KEY`, or `AI_BASE_URL` + `AI_API_KEY`) | Coolify web + ops (testnet 2026-10-11: `OPENAI_API_KEY` — the owner's key Agari runs on, copied app to app from `agari-ops`, runtime-only, never shown) | Sensei (`/api/sensei`), agents; `SENSEI_VIA=mpp` pays Sensei through the MPP payer instead (web then needs `MPP_PAYER_PRIVATE_KEY` + `MPP_ROOT_ADDRESS`); `SENSEI_MODEL` / `AI_MODEL` override the default (`anthropic/claude-opus-5-5` with its key, else `openai/gpt-6-sol`) |
| `X_OAUTH2_CLIENT_ID`, `X_OAUTH2_CLIENT_SECRET` (X app "mitoshi-testnet", App ID 33529547; OAuth 2.0 client), `X_API_KEY`, `X_API_KEY_SECRET` (its OAuth 1.0a consumer pair: the web's sign-in fallback, and with the bot's `X_ACCESS_TOKEN`/`X_ACCESS_TOKEN_SECRET` the relay's X API reads and replies), `X_SESSION_SECRET` (≥ 32 bytes; signs the X session cookie), `X_REDIRECT_URI`, `NEXT_PUBLIC_X_HANDLE` (build-time) | Coolify web (testnet: values in `~/.config/mitoshi/x-testnet.env`, 0600; locally `web/.env.local`, gitignored) — set on Coolify web testnet 2026-10-13, runtime-only except `NEXT_PUBLIC_X_HANDLE`. The web reads no `X_BEARER_TOKEN` (ops-only) | `/api/x/*` (S11) |
| `X_HANDLE`, `X_RETTIWT_API_KEY` (the bot @Mitoshi_app's session: base64 of `auth_token=…;ct0=…;twid=…;`, rettiwt-api 7.1.4), `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, `X_API_KEY`, `X_API_KEY_SECRET`, `X_BEARER_TOKEN`, `X_POSTING_ENABLED`, `X_RELAY_LIVE`, the executor `X_RELAY_PRIVATE_KEY` (the `x-relay` role key `0x1022…08Fc`, `~/.config/cwf/testnet/x-relay.json`) or `X_EXECUTOR_PRIVATE_KEY` | Coolify ops (testnet values as above; locally `services/ops/.env.local`, gitignored) — set on Coolify ops testnet 2026-10-13 (`X_RELAY_PRIVATE_KEY`, `X_RELAY_LIVE=1`, `X_POSTING_ENABLED=1` from the owner's file; `OPS_ACTORS` gains `x-relay` as its 27th) | ops `x-relay` (S11) |
| `FINNHUB_API_KEY`, `ALPACA_*`, `DATASTREAMS_API_KEY/SECRET` | Coolify web + ops (testnet ops: the owner's Alpaca + Finnhub keys, the same ones Agari uses, set 2026-09-29 runtime-only; testnet web: `FINNHUB_API_KEY` copied app to app from ops 2026-10-10 for `/news`, runtime-only, never shown) | data providers (calendar, halts, earnings) |
| `TEMPO_INDEXER_API_KEY` (Tempo API console key, `tempo-api-key` header) | Coolify ops (testnet: the owner's sandbox key from `~/.config/mitoshi/indexer.env`, 0600; set 2026-10-13 runtime-only, literal, never shown) | `indexer-recount` (D-086) |
| `TIDX_URL`, `TIDX_BASIC_AUTH` | Coolify ops (when a self-hosted tidx is chosen, D-086) | indexer recount |
| RPC provider URLs (`TEMPO_RPC_*`) | Coolify web + ops + GitHub Actions | chain reads. D-231 retired the bridge's `RH_RPC_HTTP_URL` and `BASE_SEPOLIA_RPC_HTTP_URL` from web and ops; the nightly fork suite's `RH_RPC_HTTP_URL` (CrwdMultiplier, which falls back to a public RPC) goes with the stock guard's tests |
| APNs `.p8` + key ID + team ID, FCM service account | Coolify ops | notifier (SM2) |
| Reown project ID | Coolify web | WalletConnect |
| EAS token, Android upload keystore (EAS-managed) | GitHub Actions / EAS | mobile builds |
| Coolify API token | local CLI context only (never in GitHub unless push-to-deploy option (b) is chosen) | deploys |

Rules: never print or commit a value; `redact()` in ops scrubs known secrets from logs; keys are 0600 files locally.
